//! Ajustes reversíveis do Windows (4.6): regras puras.
//!
//! Três ajustes, todos sem administrador: trocar o plano de energia, ligar o
//! Modo de Jogo e ligar/desligar programas da inicialização do **usuário** (o
//! mesmo valor que o Gerenciador de Tarefas grava em `StartupApproved`; o `Run`
//! nunca é tocado). A tela manda só pedidos (`TweakRequest`); o Rust confere
//! cada um contra a leitura de agora, guarda o valor anterior e audita. Desfazer
//! só vale para o ajuste mais recente de cada item e só se o valor atual ainda
//! for o que o app gravou (se mudou fora do app, o app não mexe).
//!
//! A leitura e a escrita no Windows ficam em `platform::system_tweaks`
//! (trait `SystemTweaker`), separadas da análise da 4.5.

use serde::{Deserialize, Serialize};

use crate::domain::system_settings::power::RawPowerPlan;
use crate::domain::system_settings::startup::{item_id, parse_approval, StartupLocation};
use crate::error::{AppError, AppResult};

/// Pedidos aceitos por chamada.
pub const MAX_REQUESTS: usize = 50;
/// Maior nome de programa aceito (nome de valor do `Run` ou de arquivo).
const MAX_NAME_LEN: usize = 260;

/// Mensagem quando o app está elevado: os ajustes nunca têm mais poder que o usuário.
pub const ELEVATED_MESSAGE: &str =
    "O app está aberto como administrador. Feche-o e abra de novo normalmente para fazer ajustes.";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TweakKind {
    PowerPlan,
    GameMode,
    StartupItem,
}

impl TweakKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::PowerPlan => "power_plan",
            Self::GameMode => "game_mode",
            Self::StartupItem => "startup_item",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "power_plan" => Some(Self::PowerPlan),
            "game_mode" => Some(Self::GameMode),
            "startup_item" => Some(Self::StartupItem),
            _ => None,
        }
    }
}

/// O que a tela pede. Nunca carrega caminhos ou chaves do registro.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum TweakRequest {
    PowerPlan {
        guid: String,
    },
    /// Liga o Modo de Jogo.
    GameMode,
    StartupItem {
        location: StartupLocation,
        name: String,
        enabled: bool,
    },
}

/// Onde o ajuste lê e grava.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TweakTarget {
    ActivePowerPlan,
    GameMode,
    Startup {
        location: StartupLocation,
        name: String,
    },
}

const POWER_TARGET: &str = "power.active";
const GAME_MODE_TARGET: &str = "gameMode";
const STARTUP_PREFIX: &str = "startup:";

impl TweakTarget {
    pub fn kind(&self) -> TweakKind {
        match self {
            Self::ActivePowerPlan => TweakKind::PowerPlan,
            Self::GameMode => TweakKind::GameMode,
            Self::Startup { .. } => TweakKind::StartupItem,
        }
    }

    /// Chave estável (coluna `target`).
    pub fn key(&self) -> String {
        match self {
            Self::ActivePowerPlan => POWER_TARGET.into(),
            Self::GameMode => GAME_MODE_TARGET.into(),
            Self::Startup { location, name } => {
                format!("{STARTUP_PREFIX}{}", item_id(*location, name))
            }
        }
    }

    /// Reconstrói o alvo de um registro salvo (para o Desfazer).
    pub fn parse(kind: TweakKind, key: &str) -> Option<Self> {
        match kind {
            TweakKind::PowerPlan => (key == POWER_TARGET).then_some(Self::ActivePowerPlan),
            TweakKind::GameMode => (key == GAME_MODE_TARGET).then_some(Self::GameMode),
            TweakKind::StartupItem => {
                let (location, name) = key.strip_prefix(STARTUP_PREFIX)?.split_once(':')?;
                let location = [StartupLocation::UserRun, StartupLocation::UserStartupFolder]
                    .into_iter()
                    .find(|candidate| candidate.key() == location)?;
                Some(Self::Startup {
                    location,
                    name: name.to_string(),
                })
            }
        }
    }
}

/// Valor de um ajuste: o que estava antes e o que foi gravado.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum TweakValue {
    PowerPlan {
        guid: String,
        name: String,
    },
    /// `AutoGameModeEnabled`; `None` = ausente (ligado, padrão do Windows).
    GameMode {
        value: Option<u32>,
    },
    /// Valor do `StartupApproved` em hexadecimal; `None` = ausente (ligado).
    StartupApproval {
        bytes: Option<String>,
        enabled: bool,
    },
}

fn game_mode_enabled(value: Option<u32>) -> bool {
    value != Some(0)
}

impl TweakValue {
    /// Mesmo efeito no Windows (a data gravada no `StartupApproved` não conta).
    pub fn same_effect(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::PowerPlan { guid: a, .. }, Self::PowerPlan { guid: b, .. }) => {
                a.eq_ignore_ascii_case(b)
            }
            (Self::GameMode { value: a }, Self::GameMode { value: b }) => {
                game_mode_enabled(*a) == game_mode_enabled(*b)
            }
            (
                Self::StartupApproval { enabled: a, .. },
                Self::StartupApproval { enabled: b, .. },
            ) => a == b,
            _ => false,
        }
    }

    /// Valor do `StartupApproved` lido. `None` = formato desconhecido (o app não mexe).
    pub fn startup_from(bytes: Option<&[u8]>) -> Option<Self> {
        match bytes {
            None => Some(Self::StartupApproval {
                bytes: None,
                enabled: true,
            }),
            Some(bytes) => parse_approval(bytes).map(|approval| Self::StartupApproval {
                bytes: Some(to_hex(bytes)),
                enabled: approval.enabled,
            }),
        }
    }
}

pub fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn from_hex(text: &str) -> Option<Vec<u8>> {
    if text.len() % 2 != 0 || !text.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    (0..text.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&text[index..index + 2], 16).ok())
        .collect()
}

/// FILETIME (intervalos de 100 ns desde 1601) de um instante Unix em ms.
pub fn filetime_from_unix_ms(unix_ms: i64) -> i64 {
    const UNIX_EPOCH_AS_FILETIME: i64 = 116_444_736_000_000_000;
    UNIX_EPOCH_AS_FILETIME + unix_ms * 10_000
}

/// Valor do `StartupApproved` como o Gerenciador de Tarefas grava: `02` e zeros
/// para ligado; `03` e a data em que foi desligado.
pub fn approval_bytes(enabled: bool, filetime: i64) -> Vec<u8> {
    let mut bytes = vec![if enabled { 0x02 } else { 0x03 }, 0, 0, 0];
    let time: i64 = if enabled { 0 } else { filetime };
    bytes.extend_from_slice(&time.to_le_bytes());
    bytes
}

/// Ajuste validado, pronto para conferir o valor atual e gravar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannedTweak {
    pub target: TweakTarget,
    /// Nome legível (vai para o histórico e o log).
    pub label: String,
    pub desired: TweakValue,
}

fn validate_startup_name(location: StartupLocation, name: &str) -> AppResult<()> {
    let invalid = name.trim().is_empty()
        || name.chars().count() > MAX_NAME_LEN
        || name.contains('\0')
        || (location == StartupLocation::UserStartupFolder
            && (name.contains(['\\', '/']) || name == "." || name == ".."));
    if invalid {
        return Err(AppError::Validation(
            "Nome de programa da inicialização inválido.".into(),
        ));
    }
    Ok(())
}

/// Valida um pedido. Planos: só os que existem agora; inicialização: só do usuário.
pub fn plan(
    request: &TweakRequest,
    plans: &[RawPowerPlan],
    now_filetime: i64,
) -> AppResult<PlannedTweak> {
    match request {
        TweakRequest::PowerPlan { guid } => {
            let plan = plans
                .iter()
                .find(|plan| plan.guid.eq_ignore_ascii_case(guid))
                .ok_or_else(|| {
                    AppError::Validation("Esse plano de energia não existe mais neste PC.".into())
                })?;
            Ok(PlannedTweak {
                target: TweakTarget::ActivePowerPlan,
                label: "Plano de energia".into(),
                desired: TweakValue::PowerPlan {
                    guid: plan.guid.to_ascii_lowercase(),
                    name: plan.name.clone(),
                },
            })
        }
        TweakRequest::GameMode => Ok(PlannedTweak {
            target: TweakTarget::GameMode,
            label: "Modo de Jogo".into(),
            desired: TweakValue::GameMode { value: Some(1) },
        }),
        TweakRequest::StartupItem {
            location,
            name,
            enabled,
        } => {
            if !location.editable() {
                return Err(AppError::Validation(
                    "Este programa é da máquina: só o Gerenciador de Tarefas, como administrador, muda o estado dele.".into(),
                ));
            }
            validate_startup_name(*location, name)?;
            Ok(PlannedTweak {
                target: TweakTarget::Startup {
                    location: *location,
                    name: name.clone(),
                },
                label: name.clone(),
                desired: TweakValue::StartupApproval {
                    bytes: Some(to_hex(&approval_bytes(*enabled, now_filetime))),
                    enabled: *enabled,
                },
            })
        }
    }
}

/// Ajuste salvo, como a tela mostra no histórico.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TweakRecord {
    pub id: i64,
    pub kind: TweakKind,
    pub target: String,
    pub label: String,
    pub previous: TweakValue,
    pub applied: TweakValue,
    pub applied_at: String,
    pub undone_at: Option<String>,
    /// É o mais recente do item e ainda não foi desfeito.
    pub undoable: bool,
}

/// Pode desfazer? `current` é o valor lido agora no Windows.
pub fn check_undo(record: &TweakRecord, current: &TweakValue) -> AppResult<()> {
    if record.undone_at.is_some() {
        return Err(AppError::Validation("Este ajuste já foi desfeito.".into()));
    }
    if !record.undoable {
        return Err(AppError::Validation(
            "Há um ajuste mais recente neste item: desfaça aquele primeiro.".into(),
        ));
    }
    if !current.same_effect(&record.applied) {
        return Err(AppError::Validation(
            "O valor mudou fora do app depois do ajuste. Para não desfazer algo que você mudou, o app não mexe; se quiser, mude pelo Windows.".into(),
        ));
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum TweakOutcome {
    Applied {
        id: i64,
    },
    /// Já estava no valor pedido: nada foi gravado.
    Unchanged,
    Failed {
        message: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TweakResult {
    pub label: String,
    #[serde(flatten)]
    pub outcome: TweakOutcome,
}

/// Leitura e escrita no Windows (em `platform`; falso nos testes).
pub trait SystemTweaker {
    fn power_plans(&self) -> AppResult<Vec<RawPowerPlan>>;
    fn read(&self, target: &TweakTarget) -> AppResult<TweakValue>;
    fn write(&self, target: &TweakTarget, value: &TweakValue) -> AppResult<()>;
    /// O programa ainda está no `Run`/pasta Inicializar do usuário?
    fn startup_exists(&self, location: StartupLocation, name: &str) -> AppResult<bool>;
}

#[cfg(test)]
mod tests {
    use super::*;

    const HIGH: &str = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";
    /// 2024-01-01T00:00:00Z.
    const FILETIME_2024: i64 = 133_485_408_000_000_000;

    fn plans() -> Vec<RawPowerPlan> {
        vec![RawPowerPlan {
            guid: HIGH.to_ascii_uppercase(),
            name: "Alto desempenho".into(),
        }]
    }

    fn record(applied: TweakValue) -> TweakRecord {
        TweakRecord {
            id: 1,
            kind: TweakKind::StartupItem,
            target: "startup:userRun:Chat".into(),
            label: "Chat".into(),
            previous: TweakValue::StartupApproval {
                bytes: None,
                enabled: true,
            },
            applied,
            applied_at: "2026-10-16T12:00:00Z".into(),
            undone_at: None,
            undoable: true,
        }
    }

    #[test]
    fn requests_from_the_screen() {
        let request: TweakRequest = serde_json::from_value(serde_json::json!({
            "kind": "startupItem", "location": "userRun", "name": "Chat", "enabled": false
        }))
        .unwrap();
        assert_eq!(
            request,
            TweakRequest::StartupItem {
                location: StartupLocation::UserRun,
                name: "Chat".into(),
                enabled: false
            }
        );
        let game: TweakRequest =
            serde_json::from_value(serde_json::json!({ "kind": "gameMode" })).unwrap();
        assert_eq!(game, TweakRequest::GameMode);
    }

    #[test]
    fn plans_only_existing_power_plans() {
        let planned = plan(&TweakRequest::PowerPlan { guid: HIGH.into() }, &plans(), 0).unwrap();
        assert_eq!(planned.target, TweakTarget::ActivePowerPlan);
        assert_eq!(
            planned.desired,
            TweakValue::PowerPlan {
                guid: HIGH.into(),
                name: "Alto desempenho".into()
            }
        );
        let missing = plan(
            &TweakRequest::PowerPlan {
                guid: "00000000-0000-0000-0000-000000000000".into(),
            },
            &plans(),
            0,
        );
        assert!(matches!(missing, Err(AppError::Validation(_))));
    }

    #[test]
    fn startup_changes_only_for_user_items() {
        let disable = plan(
            &TweakRequest::StartupItem {
                location: StartupLocation::UserRun,
                name: "Chat".into(),
                enabled: false,
            },
            &[],
            FILETIME_2024,
        )
        .unwrap();
        assert_eq!(disable.target.key(), "startup:userRun:Chat");
        let TweakValue::StartupApproval { bytes, enabled } = &disable.desired else {
            panic!("esperava StartupApproval");
        };
        assert!(!enabled);
        // O mesmo formato que o Gerenciador de Tarefas grava (e que a 4.5 lê).
        let raw = from_hex(bytes.as_deref().unwrap()).unwrap();
        let approval = parse_approval(&raw).unwrap();
        assert!(!approval.enabled);
        assert_eq!(approval.changed_at_ms, Some(1_704_067_200_000));

        let machine = plan(
            &TweakRequest::StartupItem {
                location: StartupLocation::MachineRun,
                name: "Driver".into(),
                enabled: false,
            },
            &[],
            0,
        );
        assert!(matches!(machine, Err(AppError::Validation(_))));

        for name in ["", "  ", "..", r"..\outro.lnk", "a/b.lnk"] {
            let result = plan(
                &TweakRequest::StartupItem {
                    location: StartupLocation::UserStartupFolder,
                    name: name.into(),
                    enabled: true,
                },
                &[],
                0,
            );
            assert!(result.is_err(), "nome {name:?}");
        }
    }

    #[test]
    fn approval_bytes_match_task_manager() {
        assert_eq!(approval_bytes(true, FILETIME_2024), {
            let mut bytes = vec![2, 0, 0, 0];
            bytes.extend([0; 8]);
            bytes
        });
        assert_eq!(approval_bytes(false, FILETIME_2024)[0], 3);
        assert_eq!(filetime_from_unix_ms(1_704_067_200_000), FILETIME_2024);
    }

    #[test]
    fn hex_round_trip() {
        assert_eq!(to_hex(&[0x03, 0xab, 0x00]), "03ab00");
        assert_eq!(from_hex("03ab00"), Some(vec![0x03, 0xab, 0x00]));
        assert_eq!(from_hex("0"), None);
        assert_eq!(from_hex("zz"), None);
        assert_eq!(from_hex("+1"), None);
    }

    #[test]
    fn same_effect_ignores_dates_and_defaults() {
        let off_a = TweakValue::startup_from(Some(&approval_bytes(false, 1))).unwrap();
        let off_b = TweakValue::startup_from(Some(&approval_bytes(false, 2))).unwrap();
        assert!(off_a.same_effect(&off_b));
        let absent = TweakValue::startup_from(None).unwrap();
        let on = TweakValue::startup_from(Some(&approval_bytes(true, 0))).unwrap();
        assert!(absent.same_effect(&on));
        assert!(!absent.same_effect(&off_a));
        assert_eq!(TweakValue::startup_from(Some(&[0x09])), None);

        // Modo de Jogo ausente = ligado (padrão do Windows).
        assert!(TweakValue::GameMode { value: None }
            .same_effect(&TweakValue::GameMode { value: Some(1) }));
        assert!(!TweakValue::GameMode { value: Some(0) }
            .same_effect(&TweakValue::GameMode { value: Some(1) }));
        assert!(!TweakValue::GameMode { value: None }.same_effect(&off_a));
    }

    #[test]
    fn undo_rules() {
        let off = TweakValue::startup_from(Some(&approval_bytes(false, 1))).unwrap();
        let on = TweakValue::startup_from(None).unwrap();
        assert!(check_undo(&record(off.clone()), &off).is_ok());
        // Religado fora do app depois do ajuste: não mexe.
        assert!(check_undo(&record(off.clone()), &on).is_err());

        let mut undone = record(off.clone());
        undone.undone_at = Some("2026-10-16T13:00:00Z".into());
        assert!(check_undo(&undone, &off).is_err());

        let mut older = record(off.clone());
        older.undoable = false;
        assert!(check_undo(&older, &off).is_err());
    }

    #[test]
    fn targets_round_trip() {
        for target in [
            TweakTarget::ActivePowerPlan,
            TweakTarget::GameMode,
            TweakTarget::Startup {
                location: StartupLocation::UserStartupFolder,
                name: "Atalho: com dois pontos.lnk".into(),
            },
        ] {
            assert_eq!(
                TweakTarget::parse(target.kind(), &target.key()),
                Some(target)
            );
        }
        assert_eq!(
            TweakTarget::parse(TweakKind::StartupItem, "startup:machineRun:Driver"),
            None,
            "itens da máquina nunca são alvo"
        );
        assert_eq!(TweakTarget::parse(TweakKind::GameMode, "outro"), None);
        assert_eq!(
            TweakKind::parse("startup_item"),
            Some(TweakKind::StartupItem)
        );
    }
}
