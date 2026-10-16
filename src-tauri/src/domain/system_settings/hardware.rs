//! Hardware e BIOS: leituras do firmware, da CPU e da memória e as regras dos
//! achados. A BIOS nunca é alterada pelo app: tudo aqui vira recomendação.
//!
//! Sem leitura → `None` ("Não disponível"), nunca um valor estimado. A
//! velocidade da RAM abaixo da informada pelo módulo é tratada como
//! **suspeita** de XMP/EXPO desligado, nunca como certeza.

use std::collections::BTreeSet;

use serde::Serialize;

use super::smbios::{self, BiosInfo, BoardInfo, MemoryModule};
use super::{FindingLevel, LevelOrder};
use crate::domain::calendar::CalendarDate;

/// BIOS com pelo menos esta idade (em meses) vira sugestão de conferir se há
/// versão nova. O app não acessa a internet, então nunca diz "desatualizada".
pub const BIOS_AGE_MONTHS: u32 = 12;

/// Raptor Lake-S (13ª e 14ª geração Intel para desktop): família 6, modelo 0xB7.
const RAPTOR_LAKE_S_MODEL: u32 = 0xB7;
/// Primeira revisão do microcódigo com as correções de instabilidade da Intel.
pub const RAPTOR_LAKE_MIN_MICROCODE: u32 = 0x12B;

const INTEL_VENDOR: &str = "GenuineIntel";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FirmwareKind {
    Uefi,
    Legacy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TpmStatus {
    #[serde(rename = "tpm12")]
    Tpm12,
    #[serde(rename = "tpm20")]
    Tpm20,
    /// O Windows informou que não há TPM (é uma leitura, não "Não disponível").
    NotFound,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum VirtualizationState {
    /// Há um hypervisor rodando (Hyper-V, VBS…): a virtualização está ligada no
    /// firmware, mesmo que o Windows a informe como desligada para os programas.
    InUse,
    Enabled,
    Disabled,
}

/// Leituras do Windows, como vieram.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RawHardware {
    /// Buffer do `GetSystemFirmwareTable('RSMB')`.
    pub smbios: Option<Vec<u8>>,
    pub firmware: Option<FirmwareKind>,
    pub secure_boot: Option<bool>,
    pub tpm: Option<TpmStatus>,
    pub cpu_vendor: Option<String>,
    /// Ex.: "Intel64 Family 6 Model 183 Stepping 1".
    pub cpu_identifier: Option<String>,
    pub cpu_name: Option<String>,
    /// Valor binário `Update Revision` do registro.
    pub microcode: Option<Vec<u8>>,
    pub hypervisor_present: Option<bool>,
    pub virtualization_firmware: Option<bool>,
    pub memory_integrity: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub name: Option<String>,
    pub vendor: Option<String>,
    pub family: Option<u32>,
    pub model: Option<u32>,
    pub stepping: Option<u32>,
    /// Revisão do microcódigo carregado (só lida em processadores Intel).
    pub microcode: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySpeed {
    pub locator: Option<String>,
    pub configured_mts: u32,
    pub max_mts: u32,
}

/// O que foi encontrado, com os dados para o frontend montar o texto.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum HardwareFindingKind {
    /// Microcódigo anterior às correções da Intel (13ª/14ª geração).
    MicrocodeOutdated {
        revision: u32,
        minimum: u32,
    },
    /// Módulos abaixo da velocidade que eles mesmos informam.
    MemoryBelowRated {
        modules: Vec<MemorySpeed>,
    },
    /// Módulos de modelos diferentes (pode impedir o XMP/EXPO de ficar estável).
    MixedMemoryModules {
        part_numbers: Vec<String>,
    },
    BiosAge {
        release_date: String,
        months: u32,
    },
    SecureBootOff,
    TpmMissing {
        status: TpmStatus,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareFinding {
    pub level: FindingLevel,
    #[serde(flatten)]
    pub kind: HardwareFindingKind,
}

impl LevelOrder for HardwareFinding {
    fn level(&self) -> FindingLevel {
        self.level
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareReport {
    pub firmware: Option<FirmwareKind>,
    pub bios: Option<BiosInfo>,
    pub board: Option<BoardInfo>,
    pub secure_boot: Option<bool>,
    pub tpm: Option<TpmStatus>,
    pub cpu: CpuInfo,
    pub virtualization: Option<VirtualizationState>,
    /// Integridade da memória (HVCI) em execução. Só informativo.
    pub memory_integrity: Option<bool>,
    /// `false` se as tabelas SMBIOS não puderam ser lidas.
    pub smbios_available: bool,
    pub memory_modules: Vec<MemoryModule>,
    /// Mais graves primeiro.
    pub findings: Vec<HardwareFinding>,
}

/// `(família, modelo, stepping)` de "Intel64 Family 6 Model 183 Stepping 1".
pub fn parse_cpu_identifier(identifier: &str) -> (Option<u32>, Option<u32>, Option<u32>) {
    let words: Vec<&str> = identifier.split_whitespace().collect();
    let after = |label: &str| {
        words
            .iter()
            .position(|word| word.eq_ignore_ascii_case(label))
            .and_then(|index| words.get(index + 1))
            .and_then(|value| value.parse().ok())
    };
    (after("Family"), after("Model"), after("Stepping"))
}

/// Revisão do microcódigo no valor `Update Revision`: 4 bytes no Windows atual;
/// 8 bytes (revisão nos 4 últimos) em versões antigas.
pub fn parse_microcode(bytes: &[u8]) -> Option<u32> {
    let dword = |range: std::ops::Range<usize>| {
        bytes
            .get(range)
            .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    };
    let revision = match bytes.len() {
        4 => dword(0..4)?,
        8 => dword(4..8).filter(|value| *value != 0).or(dword(0..4))?,
        _ => return None,
    };
    (revision != 0).then_some(revision)
}

pub fn virtualization(
    hypervisor_present: Option<bool>,
    firmware_enabled: Option<bool>,
) -> Option<VirtualizationState> {
    if hypervisor_present == Some(true) {
        return Some(VirtualizationState::InUse);
    }
    firmware_enabled.map(|enabled| {
        if enabled {
            VirtualizationState::Enabled
        } else {
            VirtualizationState::Disabled
        }
    })
}

/// Meses completos entre duas datas (0 se `later` for anterior).
pub fn months_between(earlier: CalendarDate, later: CalendarDate) -> u32 {
    let months = (later.year() - earlier.year()) * 12 + later.month() as i32
        - earlier.month() as i32
        - i32::from(later.day() < earlier.day());
    months.max(0) as u32
}

fn cpu_info(raw: &RawHardware) -> CpuInfo {
    let (family, model, stepping) = raw
        .cpu_identifier
        .as_deref()
        .map(parse_cpu_identifier)
        .unwrap_or_default();
    let intel = raw.cpu_vendor.as_deref() == Some(INTEL_VENDOR);
    CpuInfo {
        name: raw.cpu_name.clone(),
        vendor: raw.cpu_vendor.clone(),
        family,
        model,
        stepping,
        microcode: raw
            .microcode
            .as_deref()
            .filter(|_| intel)
            .and_then(parse_microcode),
    }
}

fn microcode_finding(cpu: &CpuInfo) -> Option<HardwareFindingKind> {
    let affected = cpu.vendor.as_deref() == Some(INTEL_VENDOR)
        && cpu.family == Some(6)
        && cpu.model == Some(RAPTOR_LAKE_S_MODEL);
    let revision = cpu.microcode?;
    (affected && revision < RAPTOR_LAKE_MIN_MICROCODE).then_some(
        HardwareFindingKind::MicrocodeOutdated {
            revision,
            minimum: RAPTOR_LAKE_MIN_MICROCODE,
        },
    )
}

fn memory_findings(modules: &[MemoryModule]) -> Vec<HardwareFinding> {
    let mut findings = Vec::new();
    let below: Vec<MemorySpeed> = modules
        .iter()
        .filter_map(|module| {
            let configured = module.configured_speed_mts?;
            let max = module.max_speed_mts?;
            (configured < max).then(|| MemorySpeed {
                locator: module.locator.clone(),
                configured_mts: configured,
                max_mts: max,
            })
        })
        .collect();
    if !below.is_empty() {
        findings.push(HardwareFinding {
            level: FindingLevel::Attention,
            kind: HardwareFindingKind::MemoryBelowRated { modules: below },
        });
    }

    let part_numbers: BTreeSet<String> = modules
        .iter()
        .filter_map(|module| module.part_number.as_deref())
        .map(|part| part.trim().to_ascii_uppercase())
        .collect();
    let all_known = modules.iter().all(|module| module.part_number.is_some());
    if modules.len() > 1 && all_known && part_numbers.len() > 1 {
        findings.push(HardwareFinding {
            level: FindingLevel::Suggestion,
            kind: HardwareFindingKind::MixedMemoryModules {
                part_numbers: part_numbers.into_iter().collect(),
            },
        });
    }
    findings
}

pub fn build_report(raw: RawHardware, today: CalendarDate) -> HardwareReport {
    let parsed = raw.smbios.as_deref().and_then(smbios::parse);
    let smbios_available = parsed.is_some();
    let info = parsed.unwrap_or_default();
    let cpu = cpu_info(&raw);

    let mut findings = Vec::new();
    if let Some(kind) = microcode_finding(&cpu) {
        findings.push(HardwareFinding {
            level: FindingLevel::Critical,
            kind,
        });
    }
    findings.extend(memory_findings(&info.memory));
    let bios_date = info
        .bios
        .as_ref()
        .and_then(|bios| bios.release_date.as_deref())
        .and_then(CalendarDate::parse);
    if let Some(date) = bios_date {
        let months = months_between(date, today);
        if months >= BIOS_AGE_MONTHS {
            findings.push(HardwareFinding {
                level: FindingLevel::Suggestion,
                kind: HardwareFindingKind::BiosAge {
                    release_date: date.to_string(),
                    months,
                },
            });
        }
    }
    if raw.firmware == Some(FirmwareKind::Uefi) && raw.secure_boot == Some(false) {
        findings.push(HardwareFinding {
            level: FindingLevel::Suggestion,
            kind: HardwareFindingKind::SecureBootOff,
        });
    }
    if let Some(status @ (TpmStatus::NotFound | TpmStatus::Tpm12)) = raw.tpm {
        findings.push(HardwareFinding {
            level: FindingLevel::Suggestion,
            kind: HardwareFindingKind::TpmMissing { status },
        });
    }
    super::sort_by_level(&mut findings);

    HardwareReport {
        firmware: raw.firmware,
        bios: info.bios,
        board: info.board,
        secure_boot: raw.secure_boot,
        tpm: raw.tpm,
        cpu,
        virtualization: virtualization(raw.hypervisor_present, raw.virtualization_firmware),
        memory_integrity: raw.memory_integrity,
        smbios_available,
        memory_modules: info.memory,
        findings,
    }
}

#[cfg(test)]
mod tests {
    use super::super::smbios::tests::{bios_structure, memory_structure, raw as smbios_raw};
    use super::*;

    fn today() -> CalendarDate {
        CalendarDate::parse("2026-10-16").unwrap()
    }

    fn kinds(report: &HardwareReport) -> Vec<&HardwareFindingKind> {
        report
            .findings
            .iter()
            .map(|finding| &finding.kind)
            .collect()
    }

    /// Um PC sem nada a sugerir: BIOS recente, Secure Boot e TPM 2.0 ligados,
    /// dois módulos iguais na velocidade informada.
    fn healthy() -> RawHardware {
        RawHardware {
            smbios: Some(smbios_raw(&[
                bios_structure("BIOS Exemplo", "2001", "03/10/2026"),
                memory_structure("DIMM_A2", "PECA-3200", 16_384, 3200, 3200),
                memory_structure("DIMM_B2", "PECA-3200", 16_384, 3200, 3200),
            ])),
            firmware: Some(FirmwareKind::Uefi),
            secure_boot: Some(true),
            tpm: Some(TpmStatus::Tpm20),
            cpu_vendor: Some(INTEL_VENDOR.into()),
            cpu_identifier: Some("Intel64 Family 6 Model 183 Stepping 1".into()),
            cpu_name: Some("Processador Exemplo".into()),
            microcode: Some(vec![0x2F, 0x01, 0, 0]),
            hypervisor_present: Some(true),
            virtualization_firmware: Some(false),
            memory_integrity: Some(true),
        }
    }

    #[test]
    fn healthy_machine_has_no_findings() {
        let report = build_report(healthy(), today());
        assert!(report.findings.is_empty(), "{:?}", report.findings);
        assert!(report.smbios_available);
        assert_eq!(report.memory_modules.len(), 2);
        assert_eq!(report.cpu.family, Some(6));
        assert_eq!(report.cpu.model, Some(183));
        assert_eq!(report.cpu.microcode, Some(0x12F));
        // O hypervisor rodando prova que a virtualização está ligada no firmware,
        // mesmo com o Windows dizendo o contrário para os programas.
        assert_eq!(report.virtualization, Some(VirtualizationState::InUse));
    }

    #[test]
    fn microcode_before_the_intel_fix_is_critical() {
        let mut raw = healthy();
        raw.microcode = Some(vec![0x29, 0x01, 0, 0]);
        let report = build_report(raw, today());
        assert_eq!(report.findings[0].level, FindingLevel::Critical);
        assert_eq!(
            kinds(&report),
            [&HardwareFindingKind::MicrocodeOutdated {
                revision: 0x129,
                minimum: 0x12B
            }]
        );
    }

    #[test]
    fn microcode_rule_only_for_raptor_lake_s() {
        let mut other_model = healthy();
        other_model.cpu_identifier = Some("Intel64 Family 6 Model 151 Stepping 2".into());
        other_model.microcode = Some(vec![0x2C, 0, 0, 0]);
        assert!(build_report(other_model, today()).findings.is_empty());

        let mut amd = healthy();
        amd.cpu_vendor = Some("AuthenticAMD".into());
        amd.microcode = Some(vec![0x10, 0, 0, 0]);
        let report = build_report(amd, today());
        assert!(report.findings.is_empty());
        assert_eq!(report.cpu.microcode, None, "só lido em processadores Intel");
    }

    #[test]
    fn microcode_value_formats() {
        assert_eq!(parse_microcode(&[0x2F, 0x01, 0, 0]), Some(0x12F));
        assert_eq!(parse_microcode(&[0, 0, 0, 0, 0xB4, 0, 0, 0]), Some(0xB4));
        assert_eq!(parse_microcode(&[0x10, 0, 0, 0, 0, 0, 0, 0]), Some(0x10));
        assert_eq!(parse_microcode(&[0, 0, 0, 0]), None);
        assert_eq!(parse_microcode(&[1, 2]), None);
    }

    #[test]
    fn memory_below_rated_speed_is_a_suspicion() {
        let mut raw = healthy();
        raw.smbios = Some(smbios_raw(&[
            bios_structure("BIOS", "1", "03/10/2026"),
            memory_structure("DIMM_A2", "PECA-3200", 16_384, 3200, 2133),
            memory_structure("DIMM_B2", "PECA-3200", 16_384, 3200, 2133),
        ]));
        let report = build_report(raw, today());
        assert_eq!(report.findings.len(), 1);
        assert_eq!(report.findings[0].level, FindingLevel::Attention);
        let HardwareFindingKind::MemoryBelowRated { modules } = &report.findings[0].kind else {
            panic!("esperava MemoryBelowRated");
        };
        assert_eq!(modules.len(), 2);
        assert_eq!(modules[0].configured_mts, 2133);
        assert_eq!(modules[0].max_mts, 3200);
    }

    #[test]
    fn unknown_speeds_never_become_a_finding() {
        let mut raw = healthy();
        raw.smbios = Some(smbios_raw(&[memory_structure(
            "DIMM_A2", "PECA", 8192, 0, 2133,
        )]));
        assert!(build_report(raw, today()).findings.is_empty());
    }

    #[test]
    fn mixed_modules() {
        let mut raw = healthy();
        raw.smbios = Some(smbios_raw(&[
            bios_structure("BIOS", "1", "03/10/2026"),
            memory_structure("DIMM_A2", "MARCA-A-3200", 16_384, 3200, 3200),
            memory_structure("DIMM_B2", "marca-b-3200", 16_384, 3200, 3200),
        ]));
        let report = build_report(raw, today());
        assert_eq!(
            kinds(&report),
            [&HardwareFindingKind::MixedMemoryModules {
                part_numbers: vec!["MARCA-A-3200".into(), "MARCA-B-3200".into()]
            }]
        );

        // Sem part number em algum módulo: não dá para comparar.
        let mut unknown = healthy();
        unknown.smbios = Some(smbios_raw(&[
            memory_structure("DIMM_A2", "MARCA-A", 16_384, 3200, 3200),
            memory_structure("DIMM_B2", "", 16_384, 3200, 3200),
        ]));
        assert!(build_report(unknown, today()).findings.is_empty());
    }

    #[test]
    fn old_bios_suggests_checking_for_updates() {
        let mut raw = healthy();
        raw.smbios = Some(smbios_raw(&[bios_structure("BIOS", "1820", "05/15/2025")]));
        let report = build_report(raw, today());
        assert_eq!(
            kinds(&report),
            [&HardwareFindingKind::BiosAge {
                release_date: "2025-05-15".into(),
                months: 17
            }]
        );
        assert_eq!(
            report.bios.unwrap().release_date.as_deref(),
            Some("2025-05-15")
        );
    }

    #[test]
    fn month_differences() {
        let date = |value: &str| CalendarDate::parse(value).unwrap();
        assert_eq!(months_between(date("2025-10-16"), date("2026-10-16")), 12);
        assert_eq!(months_between(date("2025-10-17"), date("2026-10-16")), 11);
        assert_eq!(months_between(date("2026-10-20"), date("2026-10-16")), 0);
    }

    #[test]
    fn secure_boot_and_tpm() {
        let mut raw = healthy();
        raw.secure_boot = Some(false);
        raw.tpm = Some(TpmStatus::NotFound);
        let report = build_report(raw, today());
        assert_eq!(
            kinds(&report),
            [
                &HardwareFindingKind::SecureBootOff,
                &HardwareFindingKind::TpmMissing {
                    status: TpmStatus::NotFound
                }
            ]
        );

        // Firmware legado: o Secure Boot não se aplica.
        let mut legacy = healthy();
        legacy.firmware = Some(FirmwareKind::Legacy);
        legacy.secure_boot = Some(false);
        assert!(build_report(legacy, today()).findings.is_empty());
    }

    #[test]
    fn nothing_readable_means_not_available() {
        let report = build_report(RawHardware::default(), today());
        assert!(report.findings.is_empty());
        assert!(!report.smbios_available);
        assert_eq!(report.virtualization, None);
        assert_eq!(report.tpm, None);
        assert_eq!(report.cpu.microcode, None);
    }

    #[test]
    fn virtualization_states() {
        assert_eq!(
            virtualization(Some(false), Some(true)),
            Some(VirtualizationState::Enabled)
        );
        assert_eq!(
            virtualization(None, Some(false)),
            Some(VirtualizationState::Disabled)
        );
        assert_eq!(virtualization(Some(false), None), None);
    }

    #[test]
    fn cpu_identifiers() {
        assert_eq!(
            parse_cpu_identifier("AMD64 Family 25 Model 33 Stepping 2"),
            (Some(25), Some(33), Some(2))
        );
        assert_eq!(parse_cpu_identifier("ARMv8 (64-bit)"), (None, None, None));
    }
}
