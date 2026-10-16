//! Programas na inicialização, como o Gerenciador de Tarefas os mostra.
//!
//! Os programas ficam nas chaves `Run` (do usuário e da máquina) e nas pastas
//! Inicializar; ligado/desligado fica à parte, em `Explorer\StartupApproved`
//! (um binário de 12 bytes: o 1º byte diz o estado e os 8 últimos, a data em
//! que foi desligado). Sem valor no `StartupApproved` = ligado (padrão).
//! Só os itens do usuário são editáveis sem administrador (4.6).

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::domain::optimization::filetime_to_unix_ms;
use crate::domain::text::fold;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StartupLocation {
    /// `HKCU\…\CurrentVersion\Run`.
    UserRun,
    /// Pasta Inicializar do usuário.
    UserStartupFolder,
    /// `HKLM\…\CurrentVersion\Run`.
    MachineRun,
    /// `HKLM\…\WOW6432Node\…\Run` (programas de 32 bits).
    MachineRun32,
    /// Pasta Inicializar de todos os usuários.
    CommonStartupFolder,
}

impl StartupLocation {
    /// Itens da máquina exigem administrador para mudar de estado.
    pub fn editable(self) -> bool {
        matches!(self, Self::UserRun | Self::UserStartupFolder)
    }

    pub fn key(self) -> &'static str {
        match self {
            Self::UserRun => "userRun",
            Self::UserStartupFolder => "userStartupFolder",
            Self::MachineRun => "machineRun",
            Self::MachineRun32 => "machineRun32",
            Self::CommonStartupFolder => "commonStartupFolder",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StartupState {
    Enabled,
    Disabled,
    /// Valor do `StartupApproved` num formato desconhecido.
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Approval {
    pub enabled: bool,
    /// Quando foi desligado (o Windows grava 0 ao religar).
    pub changed_at_ms: Option<i64>,
}

/// Lê um valor do `StartupApproved`. `None` = formato desconhecido.
pub fn parse_approval(bytes: &[u8]) -> Option<Approval> {
    let enabled = match bytes.first()? {
        0x02 | 0x06 => true,
        0x03 | 0x07 => false,
        _ => return None,
    };
    let changed_at_ms = bytes.get(4..12).and_then(|time| {
        let filetime = i64::from_le_bytes(time.try_into().ok()?);
        filetime_to_unix_ms(filetime)
    });
    Some(Approval {
        enabled,
        changed_at_ms,
    })
}

/// Caminho do executável na linha de comando de um item do `Run`: entre aspas,
/// até o primeiro `.exe` (caminhos com espaços sem aspas são comuns) ou o
/// primeiro trecho.
pub fn executable_path(command: &str) -> Option<String> {
    let command = command.trim();
    if let Some(rest) = command.strip_prefix('"') {
        let path = rest[..rest.find('"')?].trim();
        return (!path.is_empty()).then(|| path.to_string());
    }
    let lower = command.to_ascii_lowercase();
    for (index, _) in lower.match_indices(".exe") {
        let end = index + 4;
        if command[end..].is_empty() || command[end..].starts_with(char::is_whitespace) {
            return Some(command[..end].to_string());
        }
    }
    command.split_whitespace().next().map(str::to_string)
}

/// Troca `%NOME%` pelo valor da variável de ambiente; desconhecidas ficam como estão.
pub fn expand_env(text: &str, lookup: impl Fn(&str) -> Option<String>) -> String {
    let mut result = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find('%') {
        result.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('%') {
            Some(end) if end > 0 => match lookup(&after[..end]) {
                Some(value) => {
                    result.push_str(&value);
                    rest = &after[end + 1..];
                }
                None => {
                    result.push('%');
                    rest = after;
                }
            },
            _ => {
                result.push('%');
                rest = after;
            }
        }
    }
    result.push_str(rest);
    result
}

/// Item como o Windows informa.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawStartupEntry {
    pub location: StartupLocation,
    /// Nome do valor no `Run` ou do arquivo na pasta Inicializar.
    pub name: String,
    /// Linha de comando (só itens do `Run`), com as variáveis já expandidas.
    pub command: Option<String>,
    /// Valor no `StartupApproved`; `None` = ausente (ligado).
    pub approval: Option<Vec<u8>>,
    /// O executável existe? `None` = não verificado (caminho relativo, atalho).
    pub target_exists: Option<bool>,
}

/// Tarefa de inicialização de um app da Microsoft Store.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawPackagedTask {
    /// Nome da família do pacote (ex.: `Editora.App_abc123`).
    pub package_family: String,
    pub task_id: String,
    pub state: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RawStartup {
    pub entries: Vec<RawStartupEntry>,
    /// `None` se as tarefas dos apps da Store não puderam ser lidas.
    pub packaged: Option<Vec<RawPackagedTask>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupItem {
    /// `local:nome`, estável entre leituras (usado para ligar/desligar na 4.6).
    pub id: String,
    pub location: StartupLocation,
    pub name: String,
    pub command: Option<String>,
    pub state: StartupState,
    /// Quando foi desligado, se o Windows guardou.
    pub disabled_at_ms: Option<i64>,
    pub target_exists: Option<bool>,
    pub editable: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PackagedState {
    Enabled,
    /// O app não pediu para iniciar (ou o usuário nunca ligou).
    Disabled,
    DisabledByUser,
    DisabledByPolicy,
    EnabledByPolicy,
    Unknown,
}

impl PackagedState {
    /// Valores do `StartupTaskState` do Windows.
    pub fn from_code(code: u32) -> Self {
        match code {
            0 => Self::Disabled,
            1 => Self::DisabledByUser,
            2 => Self::Enabled,
            3 => Self::DisabledByPolicy,
            4 => Self::EnabledByPolicy,
            _ => Self::Unknown,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagedTask {
    /// Nome do pacote sem o sufixo da editora.
    pub package: String,
    pub task_id: String,
    pub state: PackagedState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupReport {
    /// Por nome (sem acentos/maiúsculas), depois pelo local.
    pub items: Vec<StartupItem>,
    pub packaged: Vec<PackagedTask>,
    /// `false` se as tarefas dos apps da Store não puderam ser lidas.
    pub packaged_available: bool,
}

/// `Editora.App_abc123` → `Editora.App`.
pub fn package_name(family: &str) -> String {
    match family.rsplit_once('_') {
        Some((name, _)) if !name.is_empty() => name.to_string(),
        _ => family.to_string(),
    }
}

pub fn item_id(location: StartupLocation, name: &str) -> String {
    format!("{}:{name}", location.key())
}

fn startup_item(entry: RawStartupEntry) -> StartupItem {
    let (state, disabled_at_ms) = match entry.approval.as_deref() {
        None => (StartupState::Enabled, None),
        Some(bytes) => match parse_approval(bytes) {
            Some(approval) if approval.enabled => (StartupState::Enabled, None),
            Some(approval) => (StartupState::Disabled, approval.changed_at_ms),
            None => (StartupState::Unknown, None),
        },
    };
    StartupItem {
        id: item_id(entry.location, &entry.name),
        editable: entry.location.editable(),
        location: entry.location,
        command: entry.command,
        state,
        disabled_at_ms,
        target_exists: entry.target_exists,
        name: entry.name,
    }
}

pub fn build_report(raw: RawStartup) -> StartupReport {
    let mut items: Vec<StartupItem> = raw.entries.into_iter().map(startup_item).collect();
    items.sort_by(|a, b| {
        fold(&a.name)
            .cmp(&fold(&b.name))
            .then(a.location.cmp(&b.location))
    });
    let packaged_available = raw.packaged.is_some();
    let mut packaged: Vec<PackagedTask> = raw
        .packaged
        .unwrap_or_default()
        .into_iter()
        .map(|task| PackagedTask {
            package: package_name(&task.package_family),
            task_id: task.task_id,
            state: PackagedState::from_code(task.state),
        })
        .collect();
    packaged.sort_by_key(|task| fold(&task.package));
    StartupReport {
        items,
        packaged,
        packaged_available,
    }
}

/// O executável existe? Só caminhos absolutos são conferidos.
pub fn target_exists(command: &str, exists: impl Fn(&Path) -> bool) -> Option<bool> {
    let path = executable_path(command)?;
    let path = Path::new(&path);
    path.is_absolute().then(|| exists(path))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 2024-01-01T00:00:00Z como FILETIME.
    const FILETIME_2024: i64 = 133_485_408_000_000_000;

    fn approval(state: u8, filetime: i64) -> Vec<u8> {
        let mut bytes = vec![state, 0, 0, 0];
        bytes.extend_from_slice(&filetime.to_le_bytes());
        bytes
    }

    #[test]
    fn approval_states() {
        assert_eq!(
            parse_approval(&approval(0x02, 0)),
            Some(Approval {
                enabled: true,
                changed_at_ms: None
            })
        );
        assert!(parse_approval(&approval(0x06, 0)).unwrap().enabled);
        let disabled = parse_approval(&approval(0x03, FILETIME_2024)).unwrap();
        assert!(!disabled.enabled);
        assert_eq!(disabled.changed_at_ms, Some(1_704_067_200_000));
        assert!(!parse_approval(&approval(0x07, 0)).unwrap().enabled);
        // Curto: estado lido, sem data.
        assert_eq!(parse_approval(&[0x03]).unwrap().changed_at_ms, None);
        assert_eq!(parse_approval(&approval(0x09, 0)), None);
        assert_eq!(parse_approval(&[]), None);
    }

    #[test]
    fn executable_paths() {
        assert_eq!(
            executable_path(r#""C:\Program Files\App\app.exe" --minimized"#).as_deref(),
            Some(r"C:\Program Files\App\app.exe")
        );
        assert_eq!(
            executable_path(r"C:\Program Files\App\app.exe /background").as_deref(),
            Some(r"C:\Program Files\App\app.exe")
        );
        assert_eq!(
            executable_path(r"C:\App\app.exe").as_deref(),
            Some(r"C:\App\app.exe")
        );
        // ".exe" no meio de um nome não encerra o caminho.
        assert_eq!(
            executable_path(r"C:\x.exe.dir\run.exe -a").as_deref(),
            Some(r"C:\x.exe.dir\run.exe")
        );
        assert_eq!(
            executable_path("rundll32 shell32.dll,Control_RunDLL").as_deref(),
            Some("rundll32")
        );
        assert_eq!(executable_path(r#""unterminated"#), None);
        assert_eq!(executable_path("  "), None);
    }

    #[test]
    fn expands_environment_variables() {
        let lookup = |name: &str| match name {
            "LOCALAPPDATA" => Some(r"C:\Users\Exemplo\AppData\Local".to_string()),
            _ => None,
        };
        assert_eq!(
            expand_env(r"%LOCALAPPDATA%\App\app.exe", lookup),
            r"C:\Users\Exemplo\AppData\Local\App\app.exe"
        );
        assert_eq!(expand_env("%NAO_EXISTE%\\a", lookup), "%NAO_EXISTE%\\a");
        assert_eq!(expand_env("100% certo", lookup), "100% certo");
        assert_eq!(expand_env("%%", lookup), "%%");
    }

    #[test]
    fn checks_only_absolute_paths() {
        assert_eq!(target_exists(r"C:\App\a.exe", |_| false), Some(false));
        assert_eq!(target_exists(r#""C:\App\a.exe" -x"#, |_| true), Some(true));
        assert_eq!(target_exists("app.exe", |_| true), None);
    }

    #[test]
    fn builds_items_with_state_and_order() {
        let entry = |location, name: &str, approval: Option<Vec<u8>>| RawStartupEntry {
            location,
            name: name.into(),
            command: None,
            approval,
            target_exists: None,
        };
        let report = build_report(RawStartup {
            entries: vec![
                entry(StartupLocation::MachineRun, "Zeta", None),
                entry(
                    StartupLocation::UserRun,
                    "Ávila",
                    Some(approval(0x03, FILETIME_2024)),
                ),
                entry(
                    StartupLocation::UserStartupFolder,
                    "beta.lnk",
                    Some(vec![0x02]),
                ),
                entry(StartupLocation::UserRun, "Gama", Some(vec![0x55])),
            ],
            packaged: Some(vec![RawPackagedTask {
                package_family: "Editora.App_abc123".into(),
                task_id: "AppStartup".into(),
                state: 1,
            }]),
        });

        let names: Vec<&str> = report.items.iter().map(|item| item.name.as_str()).collect();
        assert_eq!(names, ["Ávila", "beta.lnk", "Gama", "Zeta"]);
        let avila = &report.items[0];
        assert_eq!(avila.id, "userRun:Ávila");
        assert_eq!(avila.state, StartupState::Disabled);
        assert_eq!(avila.disabled_at_ms, Some(1_704_067_200_000));
        assert!(avila.editable);
        assert_eq!(report.items[1].state, StartupState::Enabled);
        assert_eq!(report.items[2].state, StartupState::Unknown);
        let zeta = &report.items[3];
        assert_eq!(zeta.state, StartupState::Enabled, "sem valor = ligado");
        assert!(!zeta.editable, "itens da máquina exigem administrador");

        assert!(report.packaged_available);
        assert_eq!(report.packaged[0].package, "Editora.App");
        assert_eq!(report.packaged[0].state, PackagedState::DisabledByUser);
    }

    #[test]
    fn packaged_tasks_unavailable() {
        let report = build_report(RawStartup::default());
        assert!(!report.packaged_available);
        assert!(report.packaged.is_empty());
        assert_eq!(package_name("SemSufixo"), "SemSufixo");
        assert_eq!(PackagedState::from_code(9), PackagedState::Unknown);
    }
}
