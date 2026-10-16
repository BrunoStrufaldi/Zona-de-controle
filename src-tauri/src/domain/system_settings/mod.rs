//! Configurações do Windows e do hardware (4.5): SOMENTE LEITURA.
//!
//! As leituras vêm de `platform::system_settings` (trait `SystemSettingsReader`)
//! e as regras daqui devolvem achados estruturados (tipo + dados); os textos
//! ficam no frontend, como no Diagnóstico. Sem leitura → `None` ("Não
//! disponível"), nunca um valor estimado. Os ajustes (4.6) usam traits e
//! commands separados.

pub mod hardware;
pub mod power;
pub mod smbios;
pub mod startup;

use serde::Serialize;

use self::hardware::RawHardware;
use self::power::{PowerStatus, RawPower};
use self::startup::{RawStartup, StartupReport};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FindingLevel {
    /// Algo que dá para melhorar.
    Suggestion,
    Attention,
    Critical,
}

pub(crate) trait LevelOrder {
    fn level(&self) -> FindingLevel;
}

/// Mais graves primeiro; empates mantêm a ordem das verificações.
pub(crate) fn sort_by_level<T: LevelOrder>(findings: &mut [T]) {
    findings.sort_by_key(|finding| std::cmp::Reverse(finding.level()));
}

/// Valor DWORD do registro: ausente é diferente de "não deu para ler".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StoredDword {
    Absent,
    Value(u32),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawGpu {
    pub name: String,
    pub supported: bool,
    pub enabled: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingReboot {
    /// O Windows Update instalou algo e pediu para reiniciar.
    pub windows_update: bool,
    /// A manutenção de componentes do Windows espera um reinício.
    pub servicing: bool,
}

impl PendingReboot {
    pub fn required(self) -> bool {
        self.windows_update || self.servicing
    }
}

/// Leituras do Windows, como vieram.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RawWindowsSettings {
    pub power: Option<RawPower>,
    /// `AutoGameModeEnabled`; ausente = ligado (padrão do Windows).
    pub game_mode: Option<StoredDword>,
    /// Placas de vídeo (sem as de software).
    pub gpus: Option<Vec<RawGpu>>,
    pub pending_reboot: Option<PendingReboot>,
    pub startup: RawStartup,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameModeStatus {
    pub enabled: bool,
    /// Sem valor gravado: vale o padrão do Windows (ligado).
    pub by_default: bool,
}

/// Agendamento de GPU acelerado por hardware (HAGS) de uma placa.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuScheduling {
    pub name: String,
    pub supported: bool,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SettingsFindingKind {
    PendingReboot {
        windows_update: bool,
        servicing: bool,
    },
    PowerPlan {
        /// Nome do plano ativo, se identificado.
        current: Option<String>,
        suggested_guid: String,
        suggested_name: String,
        has_battery: bool,
    },
    GameModeOff,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsFinding {
    pub level: FindingLevel,
    #[serde(flatten)]
    pub kind: SettingsFindingKind,
}

impl LevelOrder for SettingsFinding {
    fn level(&self) -> FindingLevel {
        self.level
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsSettingsReport {
    pub power: Option<PowerStatus>,
    pub game_mode: Option<GameModeStatus>,
    pub gpus: Option<Vec<GpuScheduling>>,
    pub pending_reboot: Option<PendingReboot>,
    pub startup: StartupReport,
    /// Mais graves primeiro.
    pub findings: Vec<SettingsFinding>,
}

/// Fonte das leituras (o Windows em `platform`; dados falsos nos testes).
pub trait SystemSettingsReader {
    fn windows_settings(&self) -> RawWindowsSettings;
    fn hardware(&self) -> RawHardware;
}

fn game_mode(stored: StoredDword) -> GameModeStatus {
    match stored {
        StoredDword::Absent => GameModeStatus {
            enabled: true,
            by_default: true,
        },
        StoredDword::Value(value) => GameModeStatus {
            enabled: value != 0,
            by_default: false,
        },
    }
}

pub fn build_windows_report(raw: RawWindowsSettings) -> WindowsSettingsReport {
    let power = raw.power.map(PowerStatus::from_raw);
    let game_mode = raw.game_mode.map(game_mode);

    let mut findings = Vec::new();
    if let Some(pending) = raw.pending_reboot.filter(|pending| pending.required()) {
        findings.push(SettingsFinding {
            level: FindingLevel::Attention,
            kind: SettingsFindingKind::PendingReboot {
                windows_update: pending.windows_update,
                servicing: pending.servicing,
            },
        });
    }
    if let Some(power) = &power {
        if let Some(suggested) = power.suggestion() {
            findings.push(SettingsFinding {
                level: FindingLevel::Suggestion,
                kind: SettingsFindingKind::PowerPlan {
                    current: power.active().map(|plan| plan.name.clone()),
                    suggested_guid: suggested.guid.clone(),
                    suggested_name: suggested.name.clone(),
                    has_battery: power.has_battery,
                },
            });
        }
    }
    if game_mode.is_some_and(|status| !status.enabled) {
        findings.push(SettingsFinding {
            level: FindingLevel::Suggestion,
            kind: SettingsFindingKind::GameModeOff,
        });
    }
    sort_by_level(&mut findings);

    WindowsSettingsReport {
        power,
        game_mode,
        gpus: raw.gpus.map(|gpus| {
            gpus.into_iter()
                .map(|gpu| GpuScheduling {
                    name: gpu.name,
                    supported: gpu.supported,
                    enabled: gpu.enabled,
                })
                .collect()
        }),
        pending_reboot: raw.pending_reboot,
        startup: startup::build_report(raw.startup),
        findings,
    }
}

#[cfg(test)]
mod tests {
    use super::power::{RawPowerPlan, BALANCED, HIGH_PERFORMANCE};
    use super::*;

    fn raw() -> RawWindowsSettings {
        RawWindowsSettings {
            power: Some(RawPower {
                plans: vec![
                    RawPowerPlan {
                        guid: BALANCED.into(),
                        name: "Equilibrado".into(),
                    },
                    RawPowerPlan {
                        guid: HIGH_PERFORMANCE.into(),
                        name: "Alto desempenho".into(),
                    },
                ],
                active_guid: Some(HIGH_PERFORMANCE.into()),
                modern_standby: false,
                has_battery: false,
            }),
            game_mode: Some(StoredDword::Absent),
            gpus: Some(vec![RawGpu {
                name: "Placa Exemplo".into(),
                supported: true,
                enabled: true,
            }]),
            pending_reboot: Some(PendingReboot {
                windows_update: false,
                servicing: false,
            }),
            startup: RawStartup::default(),
        }
    }

    #[test]
    fn nothing_to_suggest() {
        let report = build_windows_report(raw());
        assert!(report.findings.is_empty());
        assert_eq!(
            report.game_mode,
            Some(GameModeStatus {
                enabled: true,
                by_default: true
            })
        );
        assert_eq!(report.gpus.unwrap().len(), 1);
    }

    #[test]
    fn findings_most_severe_first() {
        let mut raw = raw();
        raw.power.as_mut().unwrap().active_guid = Some(BALANCED.into());
        raw.game_mode = Some(StoredDword::Value(0));
        raw.pending_reboot = Some(PendingReboot {
            windows_update: true,
            servicing: false,
        });
        let report = build_windows_report(raw);
        assert_eq!(
            report
                .findings
                .iter()
                .map(|finding| &finding.kind)
                .collect::<Vec<_>>(),
            [
                &SettingsFindingKind::PendingReboot {
                    windows_update: true,
                    servicing: false
                },
                &SettingsFindingKind::PowerPlan {
                    current: Some("Equilibrado".into()),
                    suggested_guid: HIGH_PERFORMANCE.into(),
                    suggested_name: "Alto desempenho".into(),
                    has_battery: false,
                },
                &SettingsFindingKind::GameModeOff,
            ]
        );
        assert_eq!(report.findings[0].level, FindingLevel::Attention);
    }

    #[test]
    fn unreadable_settings_are_not_available() {
        let report = build_windows_report(RawWindowsSettings::default());
        assert!(report.findings.is_empty());
        assert_eq!(report.power, None);
        assert_eq!(report.game_mode, None);
        assert_eq!(report.gpus, None);
        assert_eq!(report.pending_reboot, None);
    }

    #[test]
    fn game_mode_values() {
        assert!(!game_mode(StoredDword::Value(0)).enabled);
        assert_eq!(
            game_mode(StoredDword::Value(1)),
            GameModeStatus {
                enabled: true,
                by_default: false
            }
        );
    }
}
