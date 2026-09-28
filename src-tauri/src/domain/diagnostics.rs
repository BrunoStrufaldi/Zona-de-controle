//! Diagnóstico do sistema: regras puras sobre a leitura atual (sem histórico).
//!
//! As verificações recebem a leitura do monitor e os limites configurados e
//! devolvem achados estruturados (tipo + números); os textos ficam no frontend.
//! Nada aqui altera o sistema: recomendações são só sugestões ao usuário.

use std::cmp::Reverse;

use serde::{Deserialize, Serialize};

use crate::domain::system_monitor::{DiskUsage, MemoryUsage, ProcessList};
use crate::error::{AppError, AppResult};

/// Chave em `app_settings`. Gravada só pelo command dedicado (com validação).
pub const THRESHOLDS_SETTING_KEY: &str = "diagnostics.thresholds";

/// Programas máximos citados por verificação (os que mais consomem).
const MAX_PROGRAM_FINDINGS: usize = 3;

/// Processos do próprio Windows que o usuário não tem como fechar.
const SYSTEM_PROCESSES: [&str; 4] = ["system", "registry", "memory compression", "secure system"];

const GIB: u64 = 1024 * 1024 * 1024;

/// Limites configuráveis (percentuais de 1 a 100; espaço livre em GB).
/// Campos `u32` de propósito: um valor fora da faixa chega a `validate` e vira
/// uma mensagem clara, em vez de um erro de desserialização do Tauri.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DiagnosticThresholds {
    pub disk_attention_percent: u32,
    pub disk_critical_percent: u32,
    /// Abaixo disso, a unidade do sistema fica crítica (o Windows precisa de
    /// espaço para atualizações e para o arquivo de paginação).
    pub system_disk_min_free_gb: u32,
    pub memory_attention_percent: u32,
    pub memory_critical_percent: u32,
    pub page_file_attention_percent: u32,
    /// Um programa usando mais que isto da RAM é citado.
    pub program_memory_percent: u32,
    /// Um programa usando mais que isto da CPU inteira é citado.
    pub program_cpu_percent: u32,
}

impl Default for DiagnosticThresholds {
    fn default() -> Self {
        Self {
            disk_attention_percent: 80,
            disk_critical_percent: 90,
            system_disk_min_free_gb: 15,
            memory_attention_percent: 80,
            memory_critical_percent: 90,
            page_file_attention_percent: 80,
            program_memory_percent: 25,
            program_cpu_percent: 50,
        }
    }
}

pub const MAX_MIN_FREE_GB: u32 = 1_000;

fn check_percent(value: u32, label: &str) -> AppResult<()> {
    if (1..=100).contains(&value) {
        Ok(())
    } else {
        Err(AppError::Validation(format!(
            "{label}: use um valor de 1 a 100%."
        )))
    }
}

fn check_pair(attention: u32, critical: u32, label: &str) -> AppResult<()> {
    if attention < critical {
        Ok(())
    } else {
        Err(AppError::Validation(format!(
            "{label}: o limite de atenção deve ser menor que o crítico."
        )))
    }
}

impl DiagnosticThresholds {
    pub fn validate(&self) -> AppResult<()> {
        check_percent(self.disk_attention_percent, "Disco (atenção)")?;
        check_percent(self.disk_critical_percent, "Disco (crítico)")?;
        check_pair(
            self.disk_attention_percent,
            self.disk_critical_percent,
            "Disco",
        )?;
        if !(1..=MAX_MIN_FREE_GB).contains(&self.system_disk_min_free_gb) {
            return Err(AppError::Validation(format!(
                "Espaço livre mínimo: use um valor de 1 a {MAX_MIN_FREE_GB} GB."
            )));
        }
        check_percent(self.memory_attention_percent, "Memória (atenção)")?;
        check_percent(self.memory_critical_percent, "Memória (crítico)")?;
        check_pair(
            self.memory_attention_percent,
            self.memory_critical_percent,
            "Memória",
        )?;
        check_percent(self.page_file_attention_percent, "Arquivo de paginação")?;
        check_percent(self.program_memory_percent, "Programa (memória)")?;
        check_percent(self.program_cpu_percent, "Programa (CPU)")?;
        Ok(())
    }

    /// Lê o valor salvo; ausente ou inválido (ex.: editado à mão) volta ao padrão.
    /// Campos ausentes assumem o padrão de cada um.
    pub fn from_stored(value: Option<&serde_json::Value>) -> Self {
        value
            .and_then(|value| serde_json::from_value::<Self>(value.clone()).ok())
            .filter(|thresholds| thresholds.validate().is_ok())
            .unwrap_or_default()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Severity {
    Attention,
    Critical,
}

/// O que foi encontrado, com os números para o frontend montar o texto.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum FindingKind {
    DiskSpace {
        mount_point: String,
        label: String,
        used_bytes: u64,
        total_bytes: u64,
        system_drive: bool,
        /// A unidade do sistema está abaixo do espaço livre mínimo.
        low_free_space: bool,
    },
    Memory {
        used_bytes: u64,
        total_bytes: u64,
    },
    PageFile {
        used_bytes: u64,
        total_bytes: u64,
    },
    ProgramMemory {
        name: String,
        instances: u32,
        memory_bytes: u64,
        total_memory_bytes: u64,
    },
    ProgramCpu {
        name: String,
        instances: u32,
        cpu_percent: f32,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticFinding {
    pub severity: Severity,
    #[serde(flatten)]
    pub kind: FindingKind,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticReport {
    /// Críticos primeiro; depois na ordem das verificações.
    pub findings: Vec<DiagnosticFinding>,
    /// Unidades fixas verificadas (removíveis são ignoradas).
    pub checked_disks: usize,
    pub checked_programs: usize,
    /// `false` se o uso de CPU por programa não pôde ser medido nesta análise.
    pub cpu_measured: bool,
    pub thresholds: DiagnosticThresholds,
}

/// Entrada das verificações: a leitura atual do monitor.
pub struct DiagnosticInput<'a> {
    pub disks: &'a [DiskUsage],
    pub memory: &'a MemoryUsage,
    pub processes: &'a ProcessList,
    /// Unidade do Windows (ex.: "C:"), quando conhecida.
    pub system_drive: Option<&'a str>,
}

/// Percentual inteiro de uso (0 a 100), arredondado para baixo.
fn percent_of(part: u64, total: u64) -> u64 {
    if total == 0 {
        0
    } else {
        (u128::from(part) * 100 / u128::from(total)) as u64
    }
}

fn severity_for(percent: u64, attention: u32, critical: u32) -> Option<Severity> {
    if percent >= u64::from(critical) {
        Some(Severity::Critical)
    } else if percent >= u64::from(attention) {
        Some(Severity::Attention)
    } else {
        None
    }
}

fn check_disks(
    input: &DiagnosticInput<'_>,
    limits: &DiagnosticThresholds,
) -> Vec<DiagnosticFinding> {
    input
        .disks
        .iter()
        .filter(|disk| !disk.removable)
        .filter_map(|disk| {
            let system_drive = input
                .system_drive
                .is_some_and(|drive| drive.eq_ignore_ascii_case(&disk.mount_point));
            let free = disk.total_bytes.saturating_sub(disk.used_bytes);
            let low_free_space =
                system_drive && free < u64::from(limits.system_disk_min_free_gb) * GIB;
            let by_usage = severity_for(
                percent_of(disk.used_bytes, disk.total_bytes),
                limits.disk_attention_percent,
                limits.disk_critical_percent,
            );
            let severity = if low_free_space {
                Some(Severity::Critical)
            } else {
                by_usage
            }?;
            Some(DiagnosticFinding {
                severity,
                kind: FindingKind::DiskSpace {
                    mount_point: disk.mount_point.clone(),
                    label: disk.label.clone(),
                    used_bytes: disk.used_bytes,
                    total_bytes: disk.total_bytes,
                    system_drive,
                    low_free_space,
                },
            })
        })
        .collect()
}

fn check_memory(memory: &MemoryUsage, limits: &DiagnosticThresholds) -> Vec<DiagnosticFinding> {
    let mut findings = Vec::new();
    if let Some(severity) = severity_for(
        percent_of(memory.used_bytes, memory.total_bytes),
        limits.memory_attention_percent,
        limits.memory_critical_percent,
    ) {
        findings.push(DiagnosticFinding {
            severity,
            kind: FindingKind::Memory {
                used_bytes: memory.used_bytes,
                total_bytes: memory.total_bytes,
            },
        });
    }
    // Sem arquivo de paginação (total 0) não há o que avaliar.
    if memory.swap_total_bytes > 0
        && percent_of(memory.swap_used_bytes, memory.swap_total_bytes)
            >= u64::from(limits.page_file_attention_percent)
    {
        findings.push(DiagnosticFinding {
            severity: Severity::Attention,
            kind: FindingKind::PageFile {
                used_bytes: memory.swap_used_bytes,
                total_bytes: memory.swap_total_bytes,
            },
        });
    }
    findings
}

fn is_system_process(name: &str) -> bool {
    SYSTEM_PROCESSES.contains(&name.to_lowercase().as_str())
}

fn check_programs(
    input: &DiagnosticInput<'_>,
    limits: &DiagnosticThresholds,
) -> Vec<DiagnosticFinding> {
    let programs: Vec<_> = input
        .processes
        .groups
        .iter()
        .filter(|group| !is_system_process(&group.name))
        .collect();
    let total_memory = input.memory.total_bytes;

    let mut by_memory: Vec<_> = programs
        .iter()
        .filter(|group| {
            percent_of(group.memory_bytes, total_memory) >= u64::from(limits.program_memory_percent)
        })
        .collect();
    by_memory.sort_by_key(|group| Reverse(group.memory_bytes));

    let mut findings: Vec<DiagnosticFinding> = by_memory
        .into_iter()
        .take(MAX_PROGRAM_FINDINGS)
        .map(|group| DiagnosticFinding {
            severity: Severity::Attention,
            kind: FindingKind::ProgramMemory {
                name: group.name.clone(),
                instances: group.instances,
                memory_bytes: group.memory_bytes,
                total_memory_bytes: total_memory,
            },
        })
        .collect();

    if input.processes.cpu_measured {
        let mut by_cpu: Vec<_> = programs
            .iter()
            .filter(|group| group.cpu_percent >= limits.program_cpu_percent as f32)
            .collect();
        by_cpu.sort_by(|a, b| b.cpu_percent.total_cmp(&a.cpu_percent));
        findings.extend(by_cpu.into_iter().take(MAX_PROGRAM_FINDINGS).map(|group| {
            DiagnosticFinding {
                severity: Severity::Attention,
                kind: FindingKind::ProgramCpu {
                    name: group.name.clone(),
                    instances: group.instances,
                    cpu_percent: group.cpu_percent,
                },
            }
        }));
    }
    findings
}

/// Roda todas as verificações sobre a leitura atual.
pub fn diagnose(input: &DiagnosticInput<'_>, limits: &DiagnosticThresholds) -> DiagnosticReport {
    let mut findings = check_disks(input, limits);
    findings.extend(check_memory(input.memory, limits));
    findings.extend(check_programs(input, limits));
    // Estável: dentro da mesma gravidade, mantém a ordem das verificações.
    findings.sort_by_key(|finding| Reverse(finding.severity));

    DiagnosticReport {
        findings,
        checked_disks: input.disks.iter().filter(|disk| !disk.removable).count(),
        checked_programs: input.processes.groups.len(),
        cpu_measured: input.processes.cpu_measured,
        thresholds: *limits,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::domain::system_monitor::{DiskKind, ProcessGroup};

    fn disk(mount_point: &str, used_gib: u64, total_gib: u64, removable: bool) -> DiskUsage {
        DiskUsage {
            mount_point: mount_point.into(),
            label: String::new(),
            file_system: "NTFS".into(),
            kind: DiskKind::Ssd,
            removable,
            used_bytes: used_gib * GIB,
            total_bytes: total_gib * GIB,
        }
    }

    fn memory(used_gib: u64, swap_used_gib: u64, swap_total_gib: u64) -> MemoryUsage {
        MemoryUsage {
            used_bytes: used_gib * GIB,
            total_bytes: 32 * GIB,
            swap_used_bytes: swap_used_gib * GIB,
            swap_total_bytes: swap_total_gib * GIB,
        }
    }

    fn program(name: &str, cpu_percent: f32, memory_gib: u64) -> ProcessGroup {
        ProcessGroup {
            name: name.into(),
            instances: 1,
            cpu_percent,
            memory_bytes: memory_gib * GIB,
        }
    }

    fn processes(groups: Vec<ProcessGroup>, cpu_measured: bool) -> ProcessList {
        ProcessList {
            cpu_measured,
            total_processes: groups.len(),
            groups,
        }
    }

    fn run(disks: &[DiskUsage], memory: &MemoryUsage, processes: &ProcessList) -> DiagnosticReport {
        diagnose(
            &DiagnosticInput {
                disks,
                memory,
                processes,
                system_drive: Some("C:"),
            },
            &DiagnosticThresholds::default(),
        )
    }

    fn healthy_memory() -> MemoryUsage {
        memory(8, 0, 10)
    }

    #[test]
    fn default_thresholds_are_valid() {
        assert!(DiagnosticThresholds::default().validate().is_ok());
    }

    #[test]
    fn rejects_invalid_thresholds() {
        let base = DiagnosticThresholds::default();
        let invalid = [
            DiagnosticThresholds {
                disk_attention_percent: 0,
                ..base
            },
            DiagnosticThresholds {
                memory_critical_percent: 101,
                ..base
            },
            DiagnosticThresholds {
                disk_attention_percent: 90,
                disk_critical_percent: 90,
                ..base
            },
            DiagnosticThresholds {
                memory_attention_percent: 95,
                memory_critical_percent: 90,
                ..base
            },
            DiagnosticThresholds {
                system_disk_min_free_gb: 0,
                ..base
            },
            DiagnosticThresholds {
                system_disk_min_free_gb: MAX_MIN_FREE_GB + 1,
                ..base
            },
            DiagnosticThresholds {
                program_cpu_percent: 0,
                ..base
            },
        ];
        for thresholds in invalid {
            assert!(thresholds.validate().is_err(), "{thresholds:?}");
        }
    }

    #[test]
    fn stored_thresholds_fall_back_to_defaults() {
        let defaults = DiagnosticThresholds::default();
        assert_eq!(DiagnosticThresholds::from_stored(None), defaults);
        assert_eq!(
            DiagnosticThresholds::from_stored(Some(&json!("texto"))),
            defaults
        );
        // Inválido (atenção ≥ crítico) volta inteiro ao padrão.
        assert_eq!(
            DiagnosticThresholds::from_stored(Some(
                &json!({ "diskAttentionPercent": 95, "diskCriticalPercent": 90 })
            )),
            defaults
        );
        // Campos ausentes assumem o padrão de cada um.
        let partial = DiagnosticThresholds::from_stored(Some(&json!({ "programCpuPercent": 70 })));
        assert_eq!(partial.program_cpu_percent, 70);
        assert_eq!(partial.disk_critical_percent, 90);
    }

    #[test]
    fn flags_full_disks_and_ignores_removable_ones() {
        let disks = [
            disk("C:", 100, 500, false),
            disk("D:", 420, 500, false),
            disk("E:", 470, 500, false),
            disk("F:", 31, 32, true),
        ];
        let report = run(&disks, &healthy_memory(), &processes(vec![], true));

        assert_eq!(report.checked_disks, 3);
        let found: Vec<_> = report
            .findings
            .iter()
            .map(|finding| match &finding.kind {
                FindingKind::DiskSpace { mount_point, .. } => {
                    (mount_point.as_str(), finding.severity)
                }
                other => panic!("inesperado: {other:?}"),
            })
            .collect();
        assert_eq!(
            found,
            [("E:", Severity::Critical), ("D:", Severity::Attention)]
        );
    }

    #[test]
    fn system_drive_with_little_free_space_is_critical() {
        // 70% em uso, mas só 12 GB livres (< 15 GB) na unidade do sistema.
        let disks = [disk("c:", 28, 40, false), disk("D:", 28, 40, false)];
        let report = run(&disks, &healthy_memory(), &processes(vec![], true));

        assert_eq!(report.findings.len(), 1);
        assert_eq!(report.findings[0].severity, Severity::Critical);
        assert!(matches!(
            report.findings[0].kind,
            FindingKind::DiskSpace {
                system_drive: true,
                low_free_space: true,
                ..
            }
        ));
    }

    #[test]
    fn flags_memory_and_page_file() {
        let report = run(&[], &memory(29, 9, 10), &processes(vec![], true));

        let kinds: Vec<_> = report
            .findings
            .iter()
            .map(|finding| (finding.severity, std::mem::discriminant(&finding.kind)))
            .collect();
        assert_eq!(
            kinds,
            [
                (
                    Severity::Critical,
                    std::mem::discriminant(&FindingKind::Memory {
                        used_bytes: 0,
                        total_bytes: 0
                    })
                ),
                (
                    Severity::Attention,
                    std::mem::discriminant(&FindingKind::PageFile {
                        used_bytes: 0,
                        total_bytes: 0
                    })
                ),
            ]
        );
    }

    #[test]
    fn healthy_memory_and_no_page_file_produce_nothing() {
        let report = run(&[], &memory(10, 0, 0), &processes(vec![], true));
        assert!(report.findings.is_empty());
    }

    #[test]
    fn cites_heavy_programs_but_never_windows_internals() {
        let list = processes(
            vec![
                program("jogo.exe", 60.0, 15),
                program("navegador.exe", 5.0, 9),
                program("Memory Compression", 0.0, 12),
                program("System", 80.0, 1),
                program("leve.exe", 1.0, 1),
            ],
            true,
        );
        let report = run(&[], &healthy_memory(), &list);

        let names: Vec<_> = report
            .findings
            .iter()
            .map(|finding| match &finding.kind {
                FindingKind::ProgramMemory { name, .. } => format!("mem:{name}"),
                FindingKind::ProgramCpu { name, .. } => format!("cpu:{name}"),
                other => panic!("inesperado: {other:?}"),
            })
            .collect();
        // 15 GB e 9 GB de 32 GB passam de 25%; "Memory Compression" e "System" são do Windows.
        assert_eq!(names, ["mem:jogo.exe", "mem:navegador.exe", "cpu:jogo.exe"]);
    }

    #[test]
    fn skips_cpu_check_when_not_measured() {
        let list = processes(vec![program("jogo.exe", 90.0, 1)], false);
        let report = run(&[], &healthy_memory(), &list);
        assert!(report.findings.is_empty());
        assert!(!report.cpu_measured);
    }

    #[test]
    fn cites_at_most_three_programs_per_check() {
        let groups = (0..5)
            .map(|index| program(&format!("p{index}.exe"), 0.0, 9))
            .collect();
        let report = run(&[], &healthy_memory(), &processes(groups, true));
        assert_eq!(report.findings.len(), MAX_PROGRAM_FINDINGS);
    }

    #[test]
    fn serializes_findings_flat_with_kind() {
        let finding = DiagnosticFinding {
            severity: Severity::Attention,
            kind: FindingKind::PageFile {
                used_bytes: 1,
                total_bytes: 2,
            },
        };
        assert_eq!(
            serde_json::to_value(finding).unwrap(),
            json!({ "severity": "attention", "kind": "pageFile", "usedBytes": 1, "totalBytes": 2 })
        );
    }
}
