//! Monitor do sistema: contratos com o frontend e regras puras sobre as leituras
//! brutas do SO (feitas em `platform::system_monitor`, somente leitura).
//!
//! Nada aqui é persistido: as leituras são ao vivo e o histórico dos gráficos
//! existe só na tela aberta.

use std::collections::HashMap;

use serde::Serialize;

/// Informações que não mudam durante a execução do app.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub host_name: Option<String>,
    /// Ex.: "Windows 11 Home".
    pub os_name: Option<String>,
    /// Número do build (ex.: "26200").
    pub os_build: Option<String>,
    pub architecture: String,
    pub cpu_brand: Option<String>,
    pub physical_cores: Option<usize>,
    pub logical_cores: usize,
    pub total_memory_bytes: u64,
    /// Instante do boot em segundos desde a época Unix.
    pub boot_time_seconds: u64,
}

/// Leitura instantânea de CPU, memória e discos.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub cpu: CpuUsage,
    pub memory: MemoryUsage,
    pub disks: Vec<DiskUsage>,
    pub uptime_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuUsage {
    /// Uso total entre 0 e 100. `None` até existirem duas leituras com o
    /// intervalo mínimo entre elas (o uso é calculado pela diferença).
    pub usage_percent: Option<f32>,
    /// Uso de cada núcleo lógico (vazio enquanto `usage_percent` for `None`).
    pub cores_percent: Vec<f32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryUsage {
    pub used_bytes: u64,
    pub total_bytes: u64,
    pub swap_used_bytes: u64,
    pub swap_total_bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiskKind {
    Ssd,
    Hdd,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskUsage {
    /// Letra da unidade sem a barra final (ex.: "C:").
    pub mount_point: String,
    /// Rótulo do volume (pode ser vazio).
    pub label: String,
    pub file_system: String,
    pub kind: DiskKind,
    pub removable: bool,
    pub used_bytes: u64,
    pub total_bytes: u64,
}

/// Processos agrupados pelo nome do executável (como "Aplicativos" no
/// Gerenciador de Tarefas: 20 processos do navegador viram uma linha).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessList {
    /// `false` na primeira leitura: o uso de CPU por processo ainda não foi medido.
    pub cpu_measured: bool,
    pub total_processes: usize,
    pub groups: Vec<ProcessGroup>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessGroup {
    pub name: String,
    pub instances: u32,
    /// Fração da CPU inteira (0 a 100), somando as instâncias.
    pub cpu_percent: f32,
    /// Memória física (working set) somada das instâncias.
    pub memory_bytes: u64,
}

/// Volume como lido do SO, antes da limpeza.
#[derive(Debug, Clone)]
pub struct RawDisk {
    pub mount_point: String,
    pub label: String,
    pub file_system: String,
    pub kind: DiskKind,
    pub removable: bool,
    pub total_bytes: u64,
    pub available_bytes: u64,
}

/// Processo como lido do SO.
#[derive(Debug, Clone)]
pub struct RawProcess {
    pub pid: u32,
    pub name: String,
    /// Uso bruto do `sysinfo`: 100 = um núcleo lógico inteiro.
    pub cpu_usage: f32,
    pub memory_bytes: u64,
}

/// PID do "Processo Ocioso do Sistema": o uso de CPU dele é o tempo ocioso.
const IDLE_PROCESS_PID: u32 = 0;

/// Limita um percentual a 0..=100 (leituras podem passar um pouco por arredondamento).
pub fn clamp_percent(value: f32) -> f32 {
    if value.is_nan() {
        0.0
    } else {
        value.clamp(0.0, 100.0)
    }
}

/// "C:\\" → "C:". Pontos de montagem em pasta mantêm o caminho sem a barra final.
pub fn normalize_mount_point(mount_point: &str) -> String {
    let trimmed = mount_point.trim_end_matches(['\\', '/']);
    if trimmed.is_empty() {
        mount_point.to_string()
    } else {
        trimmed.to_string()
    }
}

/// Descarta volumes sem capacidade (leitores de cartão vazios, unidades de
/// CD sem mídia), remove pontos de montagem repetidos e ordena pela unidade.
pub fn build_disk_usages(raw: Vec<RawDisk>) -> Vec<DiskUsage> {
    let mut disks: Vec<DiskUsage> = Vec::with_capacity(raw.len());
    for disk in raw {
        if disk.total_bytes == 0 {
            continue;
        }
        let mount_point = normalize_mount_point(&disk.mount_point);
        if disks.iter().any(|known| known.mount_point == mount_point) {
            continue;
        }
        disks.push(DiskUsage {
            mount_point,
            label: disk.label.trim().to_string(),
            file_system: disk.file_system,
            kind: disk.kind,
            removable: disk.removable,
            used_bytes: disk.total_bytes.saturating_sub(disk.available_bytes),
            total_bytes: disk.total_bytes,
        });
    }
    disks.sort_by(|a, b| a.mount_point.cmp(&b.mount_point));
    disks
}

/// Agrupa processos pelo nome (sem diferenciar maiúsculas), converte o uso de
/// CPU para fração da CPU inteira e ordena por CPU e depois por memória.
/// O processo ocioso (PID 0) é ignorado: o "uso" dele é o tempo livre da CPU.
pub fn group_processes(raw: Vec<RawProcess>, logical_cores: usize) -> Vec<ProcessGroup> {
    let cores = logical_cores.max(1) as f32;
    let mut groups: HashMap<String, ProcessGroup> = HashMap::new();

    for process in raw {
        if process.pid == IDLE_PROCESS_PID || process.name.trim().is_empty() {
            continue;
        }
        let group = groups
            .entry(process.name.to_lowercase())
            .or_insert_with(|| ProcessGroup {
                name: process.name.clone(),
                instances: 0,
                cpu_percent: 0.0,
                memory_bytes: 0,
            });
        group.instances += 1;
        group.cpu_percent += process.cpu_usage.max(0.0) / cores;
        group.memory_bytes = group.memory_bytes.saturating_add(process.memory_bytes);
    }

    let mut groups: Vec<ProcessGroup> = groups
        .into_values()
        .map(|mut group| {
            group.cpu_percent = clamp_percent(group.cpu_percent);
            group
        })
        .collect();
    groups.sort_by(|a, b| {
        b.cpu_percent
            .total_cmp(&a.cpu_percent)
            .then(b.memory_bytes.cmp(&a.memory_bytes))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    groups
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw_disk(mount_point: &str, total: u64, available: u64) -> RawDisk {
        RawDisk {
            mount_point: mount_point.into(),
            label: " Dados ".into(),
            file_system: "NTFS".into(),
            kind: DiskKind::Ssd,
            removable: false,
            total_bytes: total,
            available_bytes: available,
        }
    }

    fn raw_process(pid: u32, name: &str, cpu: f32, memory: u64) -> RawProcess {
        RawProcess {
            pid,
            name: name.into(),
            cpu_usage: cpu,
            memory_bytes: memory,
        }
    }

    #[test]
    fn clamps_percentages() {
        assert_eq!(clamp_percent(-1.0), 0.0);
        assert_eq!(clamp_percent(42.5), 42.5);
        assert_eq!(clamp_percent(100.4), 100.0);
        assert_eq!(clamp_percent(f32::NAN), 0.0);
    }

    #[test]
    fn normalizes_mount_points() {
        assert_eq!(normalize_mount_point("C:\\"), "C:");
        assert_eq!(normalize_mount_point("D:/"), "D:");
        assert_eq!(
            normalize_mount_point("C:\\Montagens\\Jogos\\"),
            "C:\\Montagens\\Jogos"
        );
        assert_eq!(normalize_mount_point("/"), "/");
    }

    #[test]
    fn builds_disks_without_empty_or_repeated_volumes() {
        let disks = build_disk_usages(vec![
            raw_disk("D:\\", 1_000, 400),
            raw_disk("E:\\", 0, 0),
            raw_disk("C:\\", 500, 100),
            raw_disk("C:\\", 999, 1),
        ]);

        assert_eq!(disks.len(), 2);
        assert_eq!(disks[0].mount_point, "C:");
        assert_eq!(disks[0].used_bytes, 400);
        assert_eq!(disks[0].total_bytes, 500);
        assert_eq!(disks[0].label, "Dados");
        assert_eq!(disks[1].mount_point, "D:");
        assert_eq!(disks[1].used_bytes, 600);
    }

    #[test]
    fn used_space_never_underflows() {
        let disks = build_disk_usages(vec![raw_disk("C:\\", 100, 150)]);
        assert_eq!(disks[0].used_bytes, 0);
    }

    #[test]
    fn groups_processes_by_name_and_normalizes_cpu_by_core_count() {
        let groups = group_processes(
            vec![
                raw_process(10, "chrome.exe", 40.0, 300),
                raw_process(11, "Chrome.exe", 20.0, 200),
                raw_process(12, "code.exe", 80.0, 100),
                raw_process(13, "notepad.exe", 0.0, 50),
            ],
            4,
        );

        assert_eq!(groups.len(), 3);
        assert_eq!(groups[0].name, "code.exe");
        assert_eq!(groups[0].cpu_percent, 20.0);
        assert_eq!(groups[1].name, "chrome.exe");
        assert_eq!(groups[1].instances, 2);
        assert_eq!(groups[1].cpu_percent, 15.0);
        assert_eq!(groups[1].memory_bytes, 500);
        assert_eq!(groups[2].name, "notepad.exe");
    }

    #[test]
    fn ignores_the_idle_process_and_nameless_entries() {
        let groups = group_processes(
            vec![
                raw_process(0, "System Idle Process", 750.0, 8),
                raw_process(4, "", 1.0, 1),
                raw_process(5, "System", 2.0, 1),
            ],
            8,
        );

        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].name, "System");
    }

    #[test]
    fn ties_on_cpu_are_ordered_by_memory_then_name() {
        let groups = group_processes(
            vec![
                raw_process(1, "b.exe", 0.0, 10),
                raw_process(2, "a.exe", 0.0, 10),
                raw_process(3, "c.exe", 0.0, 99),
            ],
            1,
        );

        let names: Vec<&str> = groups.iter().map(|g| g.name.as_str()).collect();
        assert_eq!(names, ["c.exe", "a.exe", "b.exe"]);
    }

    #[test]
    fn group_cpu_is_capped_at_100_percent() {
        let groups = group_processes(vec![raw_process(1, "x.exe", 250.0, 1)], 2);
        assert_eq!(groups[0].cpu_percent, 100.0);
    }

    #[test]
    fn zero_cores_does_not_divide_by_zero() {
        let groups = group_processes(vec![raw_process(1, "x.exe", 30.0, 1)], 0);
        assert_eq!(groups[0].cpu_percent, 30.0);
    }
}
