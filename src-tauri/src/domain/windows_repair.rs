//! Reparo do Windows (4.7): regras puras.
//!
//! Exceção mínima e explícita às regras "sem shell" e "sem administrador"
//! (decisão do usuário): o próprio executável do app, elevado pelo UAC a cada
//! reparo, roda **só** esta sequência fixa, sem argumentos vindos da tela:
//!
//! 1. DISM CheckHealth → 2. DISM ScanHealth → 3. DISM RestoreHealth (só se a
//!    imagem estiver reparável) → 4. `sfc /scannow`.
//!
//! A DISM é chamada pela API (`DismApi.dll` de System32), não pelo `dism.exe`; o
//! SFC não tem API e roda como `System32\sfc.exe /scannow` (caminho absoluto,
//! sem shell). O processo elevado conversa com o app por um named pipe
//! (mensagens deste módulo, uma por linha em JSON). Aqui ficam a sequência, o
//! protocolo, a leitura do resultado do SFC no `CBS.log` e o histórico (lido do
//! `audit_log`). Nada aqui toca o sistema.

use std::sync::atomic::AtomicBool;

use serde::{Deserialize, Serialize};

use crate::error::AppResult;

/// Argumento que liga o modo ajudante do executável.
pub const HELPER_FLAG: &str = "--windows-repair";
/// Prefixo do nome do pipe; o resto são 32 dígitos hexadecimais aleatórios.
pub const PIPE_PREFIX: &str = "zdc-repair-";
/// Linha que o app manda ao ajudante para cancelar.
pub const CANCEL_LINE: &str = "cancel";

pub const STARTED_ACTION: &str = "windows_repair.started";
pub const EXECUTED_ACTION: &str = "windows_repair.executed";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RepairStep {
    CheckHealth,
    ScanHealth,
    RestoreHealth,
    Sfc,
}

impl RepairStep {
    pub const ALL: [Self; 4] = [
        Self::CheckHealth,
        Self::ScanHealth,
        Self::RestoreHealth,
        Self::Sfc,
    ];
}

/// Estado da imagem do Windows segundo a DISM (`DismImageHealthState`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImageHealth {
    Healthy,
    Repairable,
    NonRepairable,
}

impl ImageHealth {
    pub fn from_code(code: i32) -> Option<Self> {
        match code {
            0 => Some(Self::Healthy),
            1 => Some(Self::Repairable),
            2 => Some(Self::NonRepairable),
            _ => None,
        }
    }
}

/// Resultado do SFC lido no `CBS.log` (o texto do console é traduzido; o log não).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SfcOutcome {
    NoViolations,
    Repaired,
    CouldNotRepair,
    /// O log não permitiu concluir (nunca um palpite).
    Unknown,
}

/// Tipo de erro conhecido da DISM (o texto fica no frontend).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RepairErrorKind {
    /// 0x800F081F: arquivos de origem não encontrados.
    SourceMissing,
    /// 0x800F0906 / 0x800F0907: falha ao baixar do Windows Update.
    DownloadFailed,
    /// 0x800F082F: há uma reinicialização pendente.
    RebootPending,
    /// Outra operação de manutenção (DISM, Windows Update) em andamento.
    Busy,
    Other,
}

const CBS_E_SOURCE_MISSING: u32 = 0x800F_081F;
const CBS_E_DOWNLOAD_FAILURE: u32 = 0x800F_0906;
const CBS_E_GROUPPOLICY_DISALLOWED: u32 = 0x800F_0907;
const CBS_E_PENDING: u32 = 0x800F_082F;
const ERROR_SHARING_VIOLATION_HR: u32 = 0x8007_0020;
const DISMAPI_E_DISMAPI_ALREADY_INITIALIZED: u32 = 0xC004_0001;
const CBS_E_BUSY: u32 = 0x800F_0826;
/// `HRESULT_FROM_WIN32(ERROR_CANCELLED)`.
pub const HRESULT_CANCELLED: u32 = 0x8007_04C7;
/// `ERROR_SUCCESS_REBOOT_REQUIRED`, como código de sucesso ou como HRESULT.
const REBOOT_REQUIRED: u32 = 3010;
const REBOOT_REQUIRED_HR: u32 = 0x8007_0BC2;

pub fn error_kind(code: u32) -> RepairErrorKind {
    match code {
        CBS_E_SOURCE_MISSING => RepairErrorKind::SourceMissing,
        CBS_E_DOWNLOAD_FAILURE | CBS_E_GROUPPOLICY_DISALLOWED => RepairErrorKind::DownloadFailed,
        CBS_E_PENDING => RepairErrorKind::RebootPending,
        CBS_E_BUSY | ERROR_SHARING_VIOLATION_HR | DISMAPI_E_DISMAPI_ALREADY_INITIALIZED => {
            RepairErrorKind::Busy
        }
        _ => RepairErrorKind::Other,
    }
}

/// Retorno da DISM que significa sucesso com reinício necessário.
pub fn is_reboot_required(code: u32) -> bool {
    code == REBOOT_REQUIRED || code == REBOOT_REQUIRED_HR
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum StepResult {
    /// CheckHealth / ScanHealth.
    Health {
        health: ImageHealth,
    },
    /// RestoreHealth concluído.
    Restored {
        restart_required: bool,
    },
    Sfc {
        outcome: SfcOutcome,
    },
    /// RestoreHealth dispensado (imagem saudável).
    Skipped,
    Cancelled,
    Failed {
        code: Option<u32>,
        kind: RepairErrorKind,
        /// Mensagem técnica (da DISM ou do Windows), para o log.
        detail: String,
    },
}

/// Mensagens do ajudante elevado para o app.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum HelperMessage {
    StepStarted {
        step: RepairStep,
    },
    Progress {
        step: RepairStep,
        percent: f32,
    },
    StepFinished {
        step: RepairStep,
        result: StepResult,
    },
    /// A sequência terminou (com ou sem falhas).
    Finished,
    /// O ajudante não conseguiu nem começar (ex.: DISM indisponível).
    Error {
        message: String,
    },
}

impl HelperMessage {
    pub fn to_line(&self) -> String {
        // Serializar enums simples não falha.
        format!("{}\n", serde_json::to_string(self).unwrap_or_default())
    }

    pub fn parse_line(line: &str) -> Option<Self> {
        serde_json::from_str(line.trim()).ok()
    }
}

/// Nome de pipe aceito pelo ajudante: só o formato gerado pelo app.
pub fn valid_pipe_name(name: &str) -> bool {
    name.strip_prefix(PIPE_PREFIX).is_some_and(|suffix| {
        suffix.len() == 32
            && suffix
                .chars()
                .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
    })
}

/// Argumentos do ajudante: exatamente `--windows-repair <pipe>`. Qualquer outra
/// coisa é recusada (o ajudante não aceita instruções além do pipe).
pub fn parse_helper_args(args: &[String]) -> Option<Result<String, ()>> {
    let first = args.get(1)?;
    if first != HELPER_FLAG {
        return None;
    }
    match (args.get(2), args.len()) {
        (Some(name), 3) if valid_pipe_name(name) => Some(Ok(name.clone())),
        _ => Some(Err(())),
    }
}

/// Próximo passo depois dos já concluídos (`None` = acabou).
/// Falha ou cancelamento param a sequência; imagem irreparável também (o SFC
/// depende dela). RestoreHealth só roda com a imagem reparável.
pub fn next_step(done: &[(RepairStep, StepResult)]) -> Option<RepairStep> {
    let Some((last, result)) = done.last() else {
        return Some(RepairStep::CheckHealth);
    };
    match result {
        StepResult::Failed { .. } | StepResult::Cancelled => None,
        StepResult::Health {
            health: ImageHealth::NonRepairable,
        } => None,
        _ => match last {
            RepairStep::CheckHealth => Some(RepairStep::ScanHealth),
            RepairStep::ScanHealth => Some(RepairStep::RestoreHealth),
            RepairStep::RestoreHealth => Some(RepairStep::Sfc),
            RepairStep::Sfc => None,
        },
    }
}

/// RestoreHealth é dispensado quando o ScanHealth deu "saudável".
pub fn restore_needed(done: &[(RepairStep, StepResult)]) -> bool {
    done.iter()
        .rev()
        .find_map(|(step, result)| match (step, result) {
            (RepairStep::ScanHealth, StepResult::Health { health }) => {
                Some(*health == ImageHealth::Repairable)
            }
            _ => None,
        })
        != Some(false)
}

/// Último percentual na saída do `sfc` (traduzida e às vezes em UTF-16).
pub fn parse_sfc_percent(output: &str) -> Option<u8> {
    let bytes = output.as_bytes();
    let mut last = None;
    for (index, byte) in bytes.iter().enumerate() {
        if *byte != b'%' {
            continue;
        }
        // Volta pelos espaços e pega os dígitos antes do '%'.
        let mut end = index;
        while end > 0 && bytes[end - 1] == b' ' {
            end -= 1;
        }
        let mut start = end;
        while start > 0 && bytes[start - 1].is_ascii_digit() && end - start < 3 {
            start -= 1;
        }
        if start < end {
            if let Ok(value) = output[start..end].parse::<u8>() {
                if value <= 100 {
                    last = Some(value);
                }
            }
        }
    }
    last
}

/// Texto da saída do console: o `sfc` escreve em UTF-16 quando redirecionado.
pub fn decode_console(bytes: &[u8]) -> String {
    // Em UTF-16 os bytes altos dos caracteres comuns são zero.
    let high_zeros = bytes.iter().skip(1).step_by(2).filter(|b| **b == 0).count();
    let looks_utf16 = bytes.len() >= 2 && high_zeros * 4 >= bytes.len();
    if looks_utf16 {
        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

/// Resultado do SFC pelas linhas `[SR]` do `CBS.log` gravadas nesta execução.
pub fn parse_cbs_log(log: &str) -> SfcOutcome {
    let lines = log.lines().filter(|line| line.contains("[SR]"));
    let (mut verified, mut repaired, mut failed) = (false, false, false);
    for line in lines {
        if line.contains("Cannot repair member file") || line.contains("Could not reproject") {
            failed = true;
        } else if line.contains("Repaired file") || line.contains("Repairing corrupted file") {
            repaired = true;
        } else if line.contains("Verify complete") {
            verified = true;
        }
    }
    if failed {
        SfcOutcome::CouldNotRepair
    } else if repaired {
        SfcOutcome::Repaired
    } else if verified {
        SfcOutcome::NoViolations
    } else {
        SfcOutcome::Unknown
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StepState {
    Pending,
    Running,
    Done,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepProgress {
    pub step: RepairStep,
    pub state: StepState,
    /// 0–100 no passo em andamento; `None` se a DISM/SFC ainda não informou.
    pub percent: Option<f32>,
    pub result: Option<StepResult>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RepairPhase {
    /// Esperando o usuário responder ao UAC e o ajudante se conectar.
    WaitingElevation,
    Running,
}

/// Andamento consultado pela tela.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairProgress {
    pub phase: RepairPhase,
    pub steps: Vec<StepProgress>,
    pub cancel_requested: bool,
    pub started_at_ms: i64,
}

impl RepairProgress {
    pub fn new(started_at_ms: i64) -> Self {
        Self {
            phase: RepairPhase::WaitingElevation,
            steps: RepairStep::ALL
                .iter()
                .map(|step| StepProgress {
                    step: *step,
                    state: StepState::Pending,
                    percent: None,
                    result: None,
                })
                .collect(),
            cancel_requested: false,
            started_at_ms,
        }
    }

    fn step_mut(&mut self, step: RepairStep) -> Option<&mut StepProgress> {
        self.steps.iter_mut().find(|progress| progress.step == step)
    }

    /// Aplica uma mensagem do ajudante.
    pub fn apply(&mut self, message: &HelperMessage) {
        self.phase = RepairPhase::Running;
        match message {
            HelperMessage::StepStarted { step } => {
                if let Some(progress) = self.step_mut(*step) {
                    progress.state = StepState::Running;
                    progress.percent = None;
                }
            }
            HelperMessage::Progress { step, percent } => {
                if let Some(progress) = self.step_mut(*step) {
                    progress.percent = Some(percent.clamp(0.0, 100.0));
                }
            }
            HelperMessage::StepFinished { step, result } => {
                if let Some(progress) = self.step_mut(*step) {
                    progress.state = StepState::Done;
                    progress.result = Some(result.clone());
                }
            }
            HelperMessage::Finished | HelperMessage::Error { .. } => {}
        }
    }

    pub fn results(&self) -> Vec<(RepairStep, StepResult)> {
        self.steps
            .iter()
            .filter_map(|progress| {
                progress
                    .result
                    .clone()
                    .map(|result| (progress.step, result))
            })
            .collect()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RepairOutcome {
    Success,
    Cancelled,
    Failure,
    /// O ajudante saiu sem terminar (app fechado, queda) ou o registro de
    /// "executado" não existe.
    Interrupted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepRecord {
    pub step: RepairStep,
    pub result: StepResult,
}

/// Relatório de uma execução (também o `details` da auditoria).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairReport {
    pub run_id: String,
    pub outcome: RepairOutcome,
    pub steps: Vec<StepRecord>,
    pub restart_required: bool,
    /// Erro antes dos passos (UAC recusado, ajudante sem resposta…).
    pub error: Option<String>,
}

/// Monta o relatório pelos resultados (`finished` = o ajudante avisou o fim).
pub fn build_report(
    run_id: &str,
    results: Vec<(RepairStep, StepResult)>,
    finished: bool,
    error: Option<String>,
) -> RepairReport {
    let any =
        |predicate: fn(&StepResult) -> bool| results.iter().any(|(_, result)| predicate(result));
    let outcome = if error.is_some() || any(|result| matches!(result, StepResult::Failed { .. })) {
        RepairOutcome::Failure
    } else if any(|result| matches!(result, StepResult::Cancelled)) {
        RepairOutcome::Cancelled
    } else if !finished {
        RepairOutcome::Interrupted
    } else {
        RepairOutcome::Success
    };
    let restart_required = any(|result| {
        matches!(
            result,
            StepResult::Restored {
                restart_required: true
            }
        )
    });
    RepairReport {
        run_id: run_id.to_string(),
        outcome,
        steps: results
            .into_iter()
            .map(|(step, result)| StepRecord { step, result })
            .collect(),
        restart_required,
        error,
    }
}

/// Registro do histórico (lido do `audit_log`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairHistoryEntry {
    pub started_at: String,
    pub finished_at: Option<String>,
    pub outcome: RepairOutcome,
    pub steps: Vec<StepRecord>,
    pub restart_required: bool,
    pub error: Option<String>,
}

/// Registro do log já lido: quando, e os `details`.
pub struct AuditRecord {
    pub occurred_at: String,
    pub details: Option<serde_json::Value>,
}

fn run_id_of(details: Option<&serde_json::Value>) -> Option<String> {
    details?.get("runId")?.as_str().map(str::to_string)
}

/// Junta "iniciado" e "executado" pelo `runId`. Execuções sem "executado" (app
/// fechado no meio) aparecem como interrompidas; registros ilegíveis ficam de fora.
/// Entradas mais recentes primeiro (como vêm do log).
pub fn history(started: &[AuditRecord], executed: &[AuditRecord]) -> Vec<RepairHistoryEntry> {
    let mut entries: Vec<RepairHistoryEntry> = Vec::new();
    let mut seen_runs: Vec<String> = Vec::new();
    for record in executed {
        let Some(report) = record
            .details
            .clone()
            .and_then(|details| serde_json::from_value::<RepairReport>(details).ok())
        else {
            continue;
        };
        let started_at = started
            .iter()
            .find(|start| run_id_of(start.details.as_ref()).as_deref() == Some(&report.run_id))
            .map_or_else(
                || record.occurred_at.clone(),
                |start| start.occurred_at.clone(),
            );
        seen_runs.push(report.run_id.clone());
        entries.push(RepairHistoryEntry {
            started_at,
            finished_at: Some(record.occurred_at.clone()),
            outcome: report.outcome,
            steps: report.steps,
            restart_required: report.restart_required,
            error: report.error,
        });
    }
    for record in started {
        let Some(run_id) = run_id_of(record.details.as_ref()) else {
            continue;
        };
        if !seen_runs.contains(&run_id) {
            entries.push(RepairHistoryEntry {
                started_at: record.occurred_at.clone(),
                finished_at: None,
                outcome: RepairOutcome::Interrupted,
                steps: Vec::new(),
                restart_required: false,
                error: None,
            });
        }
    }
    entries.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    entries
}

/// O que a tela precisa saber antes de oferecer o reparo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairReadiness {
    /// `DismApi.dll` e `sfc.exe` estão em System32.
    pub tools_available: bool,
    /// Reinício pendente (a DISM costuma falhar com ele); `None` = não deu para ler.
    pub pending_reboot: Option<bool>,
    pub running: bool,
}

/// O que o lançador do ajudante avisa ao caso de uso.
#[derive(Debug, Clone, PartialEq)]
pub enum LaunchEvent {
    /// O usuário aceitou o UAC e o ajudante elevado se conectou (e foi conferido).
    Connected,
    Message(HelperMessage),
}

/// Eleva o ajudante (UAC), repassa as mensagens e retorna quando ele sair.
/// `cancel` vira um pedido de cancelamento enviado ao ajudante.
/// Implementado em `platform::windows_repair`; falso nos testes.
pub trait RepairLauncher {
    fn run(&self, on_event: &mut dyn FnMut(LaunchEvent), cancel: &AtomicBool) -> AppResult<()>;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn health(health: ImageHealth) -> StepResult {
        StepResult::Health { health }
    }

    #[test]
    fn helper_arguments_are_strict() {
        let args = |list: &[&str]| list.iter().map(|arg| arg.to_string()).collect::<Vec<_>>();
        let name = "zdc-repair-0123456789abcdef0123456789abcdef";
        assert_eq!(
            parse_helper_args(&args(&["app.exe", HELPER_FLAG, name])),
            Some(Ok(name.to_string()))
        );
        assert_eq!(parse_helper_args(&args(&["app.exe"])), None);
        assert_eq!(parse_helper_args(&args(&["app.exe", "--outro"])), None);
        for bad in [
            vec!["app.exe", HELPER_FLAG],
            vec!["app.exe", HELPER_FLAG, name, "extra"],
            vec!["app.exe", HELPER_FLAG, "zdc-repair-0123"],
            vec![
                "app.exe",
                HELPER_FLAG,
                "zdc-repair-0123456789ABCDEF0123456789ABCDEF",
            ],
            vec![
                "app.exe",
                HELPER_FLAG,
                r"..\..\pipe\zdc-repair-0123456789abcdef0123456789abcd",
            ],
            vec![
                "app.exe",
                HELPER_FLAG,
                "outro-0123456789abcdef0123456789abcdef",
            ],
        ] {
            assert_eq!(parse_helper_args(&args(&bad)), Some(Err(())), "{bad:?}");
        }
    }

    #[test]
    fn sequence_skips_restore_when_healthy() {
        let mut done = Vec::new();
        assert_eq!(next_step(&done), Some(RepairStep::CheckHealth));
        done.push((RepairStep::CheckHealth, health(ImageHealth::Healthy)));
        assert_eq!(next_step(&done), Some(RepairStep::ScanHealth));
        done.push((RepairStep::ScanHealth, health(ImageHealth::Healthy)));
        assert_eq!(next_step(&done), Some(RepairStep::RestoreHealth));
        assert!(!restore_needed(&done));
        done.push((RepairStep::RestoreHealth, StepResult::Skipped));
        assert_eq!(next_step(&done), Some(RepairStep::Sfc));
        done.push((
            RepairStep::Sfc,
            StepResult::Sfc {
                outcome: SfcOutcome::NoViolations,
            },
        ));
        assert_eq!(next_step(&done), None);
    }

    #[test]
    fn sequence_repairs_when_repairable_and_stops_on_problems() {
        let repairable = vec![
            (RepairStep::CheckHealth, health(ImageHealth::Repairable)),
            (RepairStep::ScanHealth, health(ImageHealth::Repairable)),
        ];
        assert!(restore_needed(&repairable));
        assert_eq!(next_step(&repairable), Some(RepairStep::RestoreHealth));

        let broken = vec![
            (RepairStep::CheckHealth, health(ImageHealth::Healthy)),
            (RepairStep::ScanHealth, health(ImageHealth::NonRepairable)),
        ];
        assert_eq!(next_step(&broken), None);

        let failed = vec![(
            RepairStep::CheckHealth,
            StepResult::Failed {
                code: Some(CBS_E_PENDING),
                kind: RepairErrorKind::RebootPending,
                detail: "x".into(),
            },
        )];
        assert_eq!(next_step(&failed), None);
        let cancelled = vec![(RepairStep::CheckHealth, StepResult::Cancelled)];
        assert_eq!(next_step(&cancelled), None);
    }

    #[test]
    fn dism_codes() {
        assert_eq!(error_kind(0x800F_081F), RepairErrorKind::SourceMissing);
        assert_eq!(error_kind(0x800F_0906), RepairErrorKind::DownloadFailed);
        assert_eq!(error_kind(0x800F_082F), RepairErrorKind::RebootPending);
        assert_eq!(error_kind(0x8000_4005), RepairErrorKind::Other);
        assert!(is_reboot_required(3010));
        assert!(is_reboot_required(0x8007_0BC2));
        assert!(!is_reboot_required(0));
    }

    #[test]
    fn messages_round_trip() {
        let messages = [
            HelperMessage::StepStarted {
                step: RepairStep::ScanHealth,
            },
            HelperMessage::Progress {
                step: RepairStep::Sfc,
                percent: 42.5,
            },
            HelperMessage::StepFinished {
                step: RepairStep::RestoreHealth,
                result: StepResult::Restored {
                    restart_required: true,
                },
            },
            HelperMessage::Finished,
            HelperMessage::Error {
                message: "x".into(),
            },
        ];
        for message in messages {
            let line = message.to_line();
            assert!(line.ends_with('\n'));
            assert_eq!(HelperMessage::parse_line(&line), Some(message));
        }
        assert_eq!(HelperMessage::parse_line("lixo"), None);
    }

    #[test]
    fn sfc_progress_in_any_language() {
        assert_eq!(parse_sfc_percent("Verificação 45% concluída."), Some(45));
        assert_eq!(
            parse_sfc_percent("Verification 7% complete.\rVerification 100 % complete."),
            Some(100)
        );
        assert_eq!(
            parse_sfc_percent("Iniciando a verificação do sistema."),
            None
        );
        // Só até 3 dígitos e no máximo 100.
        assert_eq!(parse_sfc_percent("1234%"), None);
    }

    #[test]
    fn console_output_in_utf16() {
        let text = "Verificação 12% concluída.";
        let utf16: Vec<u8> = text.encode_utf16().flat_map(u16::to_le_bytes).collect();
        assert_eq!(decode_console(&utf16), text);
        assert_eq!(decode_console(text.as_bytes()), text);
    }

    #[test]
    fn cbs_log_outcomes() {
        // Linhas fictícias no formato do CBS.log.
        let clean = "2026-10-16 10:00:00, Info  CSI  00000001 [SR] Beginning Verify and Repair transaction\n\
                     2026-10-16 10:05:00, Info  CSI  00000002 [SR] Verify complete\n";
        assert_eq!(parse_cbs_log(clean), SfcOutcome::NoViolations);
        let repaired = format!("{clean}2026-10-16 10:06:00, Info  CSI  00000003 [SR] Repairing corrupted file \\??\\C:\\Windows\\exemplo.dll\n");
        assert_eq!(parse_cbs_log(&repaired), SfcOutcome::Repaired);
        let failed = format!("{repaired}2026-10-16 10:07:00, Info  CSI  00000004 [SR] Cannot repair member file [l:10]\"exemplo.dll\"\n");
        assert_eq!(parse_cbs_log(&failed), SfcOutcome::CouldNotRepair);
        assert_eq!(parse_cbs_log("sem linhas do SFC"), SfcOutcome::Unknown);
    }

    #[test]
    fn progress_follows_messages() {
        let mut progress = RepairProgress::new(1);
        assert_eq!(progress.phase, RepairPhase::WaitingElevation);
        progress.apply(&HelperMessage::StepStarted {
            step: RepairStep::CheckHealth,
        });
        progress.apply(&HelperMessage::Progress {
            step: RepairStep::CheckHealth,
            percent: 150.0,
        });
        assert_eq!(progress.phase, RepairPhase::Running);
        assert_eq!(progress.steps[0].state, StepState::Running);
        assert_eq!(progress.steps[0].percent, Some(100.0));
        progress.apply(&HelperMessage::StepFinished {
            step: RepairStep::CheckHealth,
            result: health(ImageHealth::Healthy),
        });
        assert_eq!(progress.steps[0].state, StepState::Done);
        assert_eq!(progress.results().len(), 1);
    }

    #[test]
    fn reports() {
        let ok = build_report(
            "r1",
            vec![(
                RepairStep::RestoreHealth,
                StepResult::Restored {
                    restart_required: true,
                },
            )],
            true,
            None,
        );
        assert_eq!(ok.outcome, RepairOutcome::Success);
        assert!(ok.restart_required);
        assert_eq!(
            build_report("r", vec![], false, None).outcome,
            RepairOutcome::Interrupted
        );
        assert_eq!(
            build_report("r", vec![], false, Some("UAC".into())).outcome,
            RepairOutcome::Failure
        );
        assert_eq!(
            build_report(
                "r",
                vec![(RepairStep::CheckHealth, StepResult::Cancelled)],
                true,
                None
            )
            .outcome,
            RepairOutcome::Cancelled
        );
    }

    #[test]
    fn history_pairs_start_and_end() {
        let report = build_report(
            "run-2",
            vec![(RepairStep::CheckHealth, health(ImageHealth::Healthy))],
            true,
            None,
        );
        let started = [
            AuditRecord {
                occurred_at: "2026-10-16T10:00:00Z".into(),
                details: Some(serde_json::json!({ "runId": "run-1" })),
            },
            AuditRecord {
                occurred_at: "2026-10-16T11:00:00Z".into(),
                details: Some(serde_json::json!({ "runId": "run-2" })),
            },
        ];
        let executed = [
            AuditRecord {
                occurred_at: "2026-10-16T11:30:00Z".into(),
                details: Some(serde_json::to_value(&report).unwrap()),
            },
            AuditRecord {
                occurred_at: "2026-10-16T09:00:00Z".into(),
                details: Some(serde_json::json!({ "ilegível": true })),
            },
        ];
        let entries = history(&started, &executed);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].started_at, "2026-10-16T11:00:00Z");
        assert_eq!(
            entries[0].finished_at.as_deref(),
            Some("2026-10-16T11:30:00Z")
        );
        assert_eq!(entries[0].outcome, RepairOutcome::Success);
        assert_eq!(entries[1].outcome, RepairOutcome::Interrupted);
        assert_eq!(entries[1].finished_at, None);
    }
}
