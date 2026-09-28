//! Leitura de CPU, memória, discos e processos via `sysinfo`.
//!
//! O uso de CPU é calculado pela diferença entre duas leituras separadas por
//! pelo menos `MINIMUM_CPU_UPDATE_INTERVAL` (200 ms no Windows). Leituras mais
//! próximas reaproveitam a anterior; antes da segunda leitura o uso fica `None`
//! (a tela mostra "Medindo…" em vez de um 0% falso).

use std::sync::Mutex;
use std::time::{Duration, Instant};

use sysinfo::{
    CpuRefreshKind, DiskRefreshKind, Disks, MemoryRefreshKind, ProcessRefreshKind,
    ProcessesToUpdate, RefreshKind, System, MINIMUM_CPU_UPDATE_INTERVAL,
};

use crate::domain::system_monitor::{
    build_disk_usages, clamp_percent, group_processes, normalize_mount_point, CpuUsage, DiskKind,
    DiskUsage, MemoryUsage, ProcessList, RawDisk, RawProcess, SystemInfo, SystemSnapshot,
};
use crate::error::{AppError, AppResult};

/// Espaço em disco muda devagar; reler a lista de volumes a cada leitura é desperdício.
const DISK_REFRESH_INTERVAL: Duration = Duration::from_secs(10);

pub struct SystemMonitor {
    sampler: Mutex<Sampler>,
}

struct Sampler {
    system: System,
    disks: Disks,
    disks_read_at: Instant,
    cpu_read_at: Instant,
    cpu_measured: bool,
    processes_read_at: Option<Instant>,
    processes_measured: bool,
}

impl SystemMonitor {
    /// Faz a primeira leitura de CPU (barata) para que o uso já esteja
    /// disponível na primeira consulta da tela, 200 ms depois.
    pub fn new() -> Self {
        let system = System::new_with_specifics(
            RefreshKind::nothing()
                .with_cpu(CpuRefreshKind::nothing().with_cpu_usage())
                .with_memory(MemoryRefreshKind::everything()),
        );
        let now = Instant::now();
        Self {
            sampler: Mutex::new(Sampler {
                system,
                disks: Disks::new_with_refreshed_list_specifics(disk_refresh_kind()),
                disks_read_at: now,
                cpu_read_at: now,
                cpu_measured: false,
                processes_read_at: None,
                processes_measured: false,
            }),
        }
    }

    pub fn info(&self) -> AppResult<SystemInfo> {
        let sampler = self.sampler.lock().map_err(|_| AppError::StatePoisoned)?;
        let brand = sampler
            .system
            .cpus()
            .first()
            .map(|cpu| cpu.brand().trim().to_string())
            .filter(|brand| !brand.is_empty());
        Ok(SystemInfo {
            host_name: System::host_name(),
            os_name: System::long_os_version(),
            os_build: System::kernel_version(),
            architecture: System::cpu_arch(),
            cpu_brand: brand,
            physical_cores: System::physical_core_count(),
            logical_cores: sampler.system.cpus().len(),
            total_memory_bytes: sampler.system.total_memory(),
            boot_time_seconds: System::boot_time(),
        })
    }

    pub fn snapshot(&self) -> AppResult<SystemSnapshot> {
        let mut sampler = self.sampler.lock().map_err(|_| AppError::StatePoisoned)?;
        sampler.refresh_cpu();
        sampler.system.refresh_memory();
        if sampler.disks_read_at.elapsed() >= DISK_REFRESH_INTERVAL {
            // `true` remove volumes desconectados; volumes novos entram na lista.
            sampler.disks.refresh_specifics(true, disk_refresh_kind());
            sampler.disks_read_at = Instant::now();
        }

        let system = &sampler.system;
        let cpu = if sampler.cpu_measured {
            CpuUsage {
                usage_percent: Some(clamp_percent(system.global_cpu_usage())),
                cores_percent: system
                    .cpus()
                    .iter()
                    .map(|cpu| clamp_percent(cpu.cpu_usage()))
                    .collect(),
            }
        } else {
            CpuUsage {
                usage_percent: None,
                cores_percent: Vec::new(),
            }
        };

        Ok(SystemSnapshot {
            cpu,
            memory: MemoryUsage {
                used_bytes: system.used_memory(),
                total_bytes: system.total_memory(),
                swap_used_bytes: system.used_swap(),
                swap_total_bytes: system.total_swap(),
            },
            disks: read_disks(&sampler.disks),
            uptime_seconds: System::uptime(),
        })
    }

    pub fn processes(&self) -> AppResult<ProcessList> {
        let mut sampler = self.sampler.lock().map_err(|_| AppError::StatePoisoned)?;
        sampler.refresh_processes();

        let raw: Vec<RawProcess> = sampler
            .system
            .processes()
            .values()
            .map(|process| RawProcess {
                pid: process.pid().as_u32(),
                name: process.name().to_string_lossy().into_owned(),
                cpu_usage: process.cpu_usage(),
                memory_bytes: process.memory(),
            })
            .collect();
        let total_processes = raw.len();
        let logical_cores = sampler.system.cpus().len();

        Ok(ProcessList {
            cpu_measured: sampler.processes_measured,
            total_processes,
            groups: group_processes(raw, logical_cores),
        })
    }
}

impl SystemMonitor {
    /// Como [`Self::processes`], mas garante o uso de CPU medido: sem leitura
    /// anterior, faz a primeira e espera o intervalo mínimo (sem segurar o lock).
    pub fn measured_processes(&self) -> AppResult<ProcessList> {
        let wait = {
            let mut sampler = self.sampler.lock().map_err(|_| AppError::StatePoisoned)?;
            if sampler.processes_read_at.is_none() {
                sampler.refresh_processes();
            }
            match sampler.processes_read_at {
                Some(read_at) if !sampler.processes_measured => {
                    Some(MINIMUM_CPU_UPDATE_INTERVAL.saturating_sub(read_at.elapsed()))
                }
                _ => None,
            }
        };
        if let Some(wait) = wait {
            std::thread::sleep(wait);
        }
        self.processes()
    }
}

/// Unidade onde o Windows está instalado (ex.: "C:"), pela variável `SystemDrive`.
pub fn system_drive() -> Option<String> {
    std::env::var("SystemDrive")
        .ok()
        .map(|drive| normalize_mount_point(drive.trim()))
        .filter(|drive| !drive.is_empty())
}

impl Default for SystemMonitor {
    fn default() -> Self {
        Self::new()
    }
}

impl Sampler {
    fn refresh_cpu(&mut self) {
        if self.cpu_read_at.elapsed() >= MINIMUM_CPU_UPDATE_INTERVAL {
            self.system.refresh_cpu_usage();
            self.cpu_read_at = Instant::now();
            self.cpu_measured = true;
        }
    }

    /// A primeira leitura de processos só registra os tempos de CPU; o uso
    /// passa a valer a partir da segunda (respeitado o intervalo mínimo).
    fn refresh_processes(&mut self) {
        let due = match self.processes_read_at {
            None => true,
            Some(read_at) => read_at.elapsed() >= MINIMUM_CPU_UPDATE_INTERVAL,
        };
        if !due {
            return;
        }
        self.system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing().with_cpu().with_memory(),
        );
        self.processes_measured = self.processes_read_at.is_some();
        self.processes_read_at = Some(Instant::now());
    }
}

fn disk_refresh_kind() -> DiskRefreshKind {
    DiskRefreshKind::nothing().with_storage().with_kind()
}

fn read_disks(disks: &Disks) -> Vec<DiskUsage> {
    let raw = disks
        .list()
        .iter()
        .map(|disk| RawDisk {
            mount_point: disk.mount_point().to_string_lossy().into_owned(),
            label: disk.name().to_string_lossy().into_owned(),
            file_system: disk.file_system().to_string_lossy().into_owned(),
            kind: match disk.kind() {
                sysinfo::DiskKind::SSD => DiskKind::Ssd,
                sysinfo::DiskKind::HDD => DiskKind::Hdd,
                sysinfo::DiskKind::Unknown(_) => DiskKind::Unknown,
            },
            removable: disk.is_removable(),
            total_bytes: disk.total_space(),
            available_bytes: disk.available_space(),
        })
        .collect();
    build_disk_usages(raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Lê o SO de verdade: confere só invariantes, nunca valores.
    #[test]
    fn reads_the_current_machine_without_panicking() {
        let monitor = SystemMonitor::new();

        let info = monitor.info().unwrap();
        assert!(info.logical_cores > 0);
        assert!(info.total_memory_bytes > 0);

        let first = monitor.snapshot().unwrap();
        assert!(first.memory.used_bytes <= first.memory.total_bytes);

        std::thread::sleep(MINIMUM_CPU_UPDATE_INTERVAL);
        let second = monitor.snapshot().unwrap();
        let usage = second
            .cpu
            .usage_percent
            .expect("CPU medida após o intervalo");
        assert!((0.0..=100.0).contains(&usage));
        assert_eq!(second.cpu.cores_percent.len(), info.logical_cores);

        let processes = monitor.processes().unwrap();
        assert!(!processes.cpu_measured);
        assert!(processes.total_processes > 0);
        std::thread::sleep(MINIMUM_CPU_UPDATE_INTERVAL);
        assert!(monitor.processes().unwrap().cpu_measured);
    }

    #[test]
    fn measured_processes_waits_for_the_second_reading() {
        let monitor = SystemMonitor::new();
        assert!(monitor.measured_processes().unwrap().cpu_measured);
    }
}
