//! Caso de uso do reparo do Windows (4.7): uma execução por vez, andamento para
//! a tela, cancelamento e auditoria (`windows_repair.started` quando o ajudante
//! elevado se conecta; `windows_repair.executed` no fim, com sucesso,
//! cancelamento ou falha). O histórico vem do próprio `audit_log`.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde_json::json;

use crate::db::Database;
use crate::domain::audit::{AuditCategory, AuditOutcome, NewAuditEntry};
use crate::domain::windows_repair::{
    build_report, history, AuditRecord, HelperMessage, LaunchEvent, RepairHistoryEntry,
    RepairLauncher, RepairOutcome, RepairPhase, RepairProgress, RepairReport, EXECUTED_ACTION,
    STARTED_ACTION,
};
use crate::error::{AppError, AppResult};
use crate::repositories::audit;

/// Maior histórico pedido pela tela.
pub const MAX_HISTORY: u32 = 50;

/// Reparo em andamento: progresso para a tela e pedido de cancelamento.
#[derive(Default)]
pub struct WindowsRepairRun {
    cancel: AtomicBool,
    progress: Mutex<Option<RepairProgress>>,
}

/// Enquanto existir, marca o reparo como em andamento.
struct RunGuard<'a>(&'a WindowsRepairRun);

impl Drop for RunGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut progress) = self.0.progress.lock() {
            *progress = None;
        }
    }
}

impl WindowsRepairRun {
    pub fn new() -> Self {
        Self::default()
    }

    fn begin(&self, started_at_ms: i64) -> AppResult<RunGuard<'_>> {
        let mut progress = self.progress.lock().map_err(|_| AppError::StatePoisoned)?;
        if progress.is_some() {
            return Err(AppError::Validation(
                "Já existe um reparo em andamento.".into(),
            ));
        }
        self.cancel.store(false, Ordering::SeqCst);
        *progress = Some(RepairProgress::new(started_at_ms));
        Ok(RunGuard(self))
    }

    fn update(&self, change: impl FnOnce(&mut RepairProgress)) {
        if let Ok(mut progress) = self.progress.lock() {
            if let Some(progress) = progress.as_mut() {
                change(progress);
            }
        }
    }

    pub fn is_running(&self) -> bool {
        self.progress
            .lock()
            .map(|progress| progress.is_some())
            .unwrap_or(true)
    }

    /// Andamento; `None` se nenhum reparo estiver rodando.
    pub fn progress(&self) -> AppResult<Option<RepairProgress>> {
        Ok(self
            .progress
            .lock()
            .map_err(|_| AppError::StatePoisoned)?
            .clone())
    }

    /// Pede o cancelamento (a DISM para; o SFC iniciado vai até o fim e nada
    /// depois dele começa). `false` se nada estava rodando.
    pub fn request_cancel(&self) -> AppResult<bool> {
        let mut progress = self.progress.lock().map_err(|_| AppError::StatePoisoned)?;
        let Some(progress) = progress.as_mut() else {
            return Ok(false);
        };
        progress.cancel_requested = true;
        self.cancel.store(true, Ordering::SeqCst);
        Ok(true)
    }
}

fn audit_outcome(outcome: RepairOutcome) -> AuditOutcome {
    match outcome {
        RepairOutcome::Success => AuditOutcome::Success,
        RepairOutcome::Cancelled => AuditOutcome::Cancelled,
        RepairOutcome::Failure | RepairOutcome::Interrupted => AuditOutcome::Failure,
    }
}

fn record(
    db: &Database,
    action: &str,
    outcome: AuditOutcome,
    details: serde_json::Value,
) -> AppResult<()> {
    db.with_connection(|connection| {
        audit::record(
            connection,
            &NewAuditEntry {
                category: AuditCategory::Optimization,
                action,
                target: None,
                outcome,
                details: Some(details),
            },
        )
    })
}

/// Roda o reparo inteiro (bloqueia até o fim) e devolve o relatório. O
/// relatório também sai quando o UAC é recusado ou o ajudante falha.
pub fn run_repair(
    db: &Database,
    run: &WindowsRepairRun,
    launcher: &impl RepairLauncher,
    run_id: &str,
    started_at_ms: i64,
) -> AppResult<RepairReport> {
    let _guard = run.begin(started_at_ms)?;
    let mut finished = false;
    let mut helper_error: Option<String> = None;
    let mut started_audit: AppResult<()> = Ok(());

    let launched = launcher.run(
        &mut |event| match event {
            LaunchEvent::Connected => {
                started_audit = record(
                    db,
                    STARTED_ACTION,
                    AuditOutcome::Success,
                    json!({ "runId": run_id }),
                );
                run.update(|progress| progress.phase = RepairPhase::Running);
            }
            LaunchEvent::Message(message) => {
                match &message {
                    HelperMessage::Finished => finished = true,
                    HelperMessage::Error { message } => helper_error = Some(message.clone()),
                    _ => {}
                }
                run.update(|progress| progress.apply(&message));
            }
        },
        &run.cancel,
    );

    let results = run
        .progress()?
        .map(|progress| progress.results())
        .unwrap_or_default();
    let error = match launched {
        Err(error) => Some(error.to_string()),
        Ok(()) => helper_error,
    };
    let report = build_report(run_id, results, finished, error);
    record(
        db,
        EXECUTED_ACTION,
        audit_outcome(report.outcome),
        serde_json::to_value(&report)?,
    )?;
    started_audit?;
    Ok(report)
}

/// Reparos mais recentes primeiro (iniciados sem fim aparecem como interrompidos).
pub fn repair_history(db: &Database, limit: u32) -> AppResult<Vec<RepairHistoryEntry>> {
    let limit = limit.clamp(1, MAX_HISTORY);
    let to_records = |entries: Vec<audit::AuditEntry>| -> Vec<AuditRecord> {
        entries
            .into_iter()
            .map(|entry| AuditRecord {
                occurred_at: entry.occurred_at,
                details: entry.details,
            })
            .collect()
    };
    db.with_connection(|connection| {
        let started = to_records(audit::list_by_action(
            connection,
            AuditCategory::Optimization,
            STARTED_ACTION,
            limit,
        )?);
        let executed = to_records(audit::list_by_action(
            connection,
            AuditCategory::Optimization,
            EXECUTED_ACTION,
            limit,
        )?);
        let mut entries = history(&started, &executed);
        entries.truncate(limit as usize);
        Ok(entries)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::windows_repair::{
        ImageHealth, RepairErrorKind, RepairStep, SfcOutcome, StepResult,
    };

    /// Lançador falso: devolve uma lista fixa de eventos ou um erro.
    struct FakeLauncher {
        events: Vec<LaunchEvent>,
        error: Option<fn() -> AppError>,
        /// Confere que o cancelamento chegou ao lançador.
        expect_cancel: bool,
    }

    impl RepairLauncher for FakeLauncher {
        fn run(&self, on_event: &mut dyn FnMut(LaunchEvent), cancel: &AtomicBool) -> AppResult<()> {
            if let Some(error) = self.error {
                return Err(error());
            }
            for event in &self.events {
                on_event(event.clone());
            }
            if self.expect_cancel {
                assert!(cancel.load(Ordering::SeqCst));
            }
            Ok(())
        }
    }

    fn finished(step: RepairStep, result: StepResult) -> LaunchEvent {
        LaunchEvent::Message(HelperMessage::StepFinished { step, result })
    }

    fn healthy_run() -> Vec<LaunchEvent> {
        let health = StepResult::Health {
            health: ImageHealth::Healthy,
        };
        vec![
            LaunchEvent::Connected,
            LaunchEvent::Message(HelperMessage::StepStarted {
                step: RepairStep::CheckHealth,
            }),
            finished(RepairStep::CheckHealth, health.clone()),
            finished(RepairStep::ScanHealth, health),
            finished(RepairStep::RestoreHealth, StepResult::Skipped),
            finished(
                RepairStep::Sfc,
                StepResult::Sfc {
                    outcome: SfcOutcome::NoViolations,
                },
            ),
            LaunchEvent::Message(HelperMessage::Finished),
        ]
    }

    fn log(db: &Database) -> Vec<audit::AuditEntry> {
        db.with_connection(|connection| audit::list_recent(connection, 20))
            .unwrap()
    }

    #[test]
    fn successful_run_is_audited_from_start_to_end() {
        let db = Database::open_in_memory().unwrap();
        let run = WindowsRepairRun::new();
        let launcher = FakeLauncher {
            events: healthy_run(),
            error: None,
            expect_cancel: false,
        };
        let report = run_repair(&db, &run, &launcher, "run-1", 1).unwrap();
        assert_eq!(report.outcome, RepairOutcome::Success);
        assert_eq!(report.steps.len(), 4);
        assert!(!run.is_running());

        let entries = log(&db);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].action, EXECUTED_ACTION);
        assert_eq!(entries[0].outcome, "success");
        assert_eq!(entries[1].action, STARTED_ACTION);

        let history = repair_history(&db, 10).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].outcome, RepairOutcome::Success);
        assert!(history[0].finished_at.is_some());
    }

    #[test]
    fn refused_elevation_is_a_failure_with_report() {
        let db = Database::open_in_memory().unwrap();
        let run = WindowsRepairRun::new();
        let launcher = FakeLauncher {
            events: vec![],
            error: Some(|| {
                AppError::Validation(
                    "A permissão de administrador foi recusada. Nada foi feito.".into(),
                )
            }),
            expect_cancel: false,
        };
        let report = run_repair(&db, &run, &launcher, "run-2", 1).unwrap();
        assert_eq!(report.outcome, RepairOutcome::Failure);
        assert!(report.error.unwrap().contains("recusada"));
        let entries = log(&db);
        assert_eq!(entries.len(), 1, "sem conexão, não há registro de início");
        assert_eq!(entries[0].outcome, "failure");
    }

    #[test]
    fn helper_exit_without_finishing_is_interrupted() {
        let db = Database::open_in_memory().unwrap();
        let run = WindowsRepairRun::new();
        let mut events = healthy_run();
        events.truncate(3);
        let launcher = FakeLauncher {
            events,
            error: None,
            expect_cancel: false,
        };
        let report = run_repair(&db, &run, &launcher, "run-3", 1).unwrap();
        assert_eq!(report.outcome, RepairOutcome::Interrupted);
        assert_eq!(log(&db)[0].outcome, "failure");
    }

    #[test]
    fn failed_step_and_dism_errors() {
        let db = Database::open_in_memory().unwrap();
        let run = WindowsRepairRun::new();
        let launcher = FakeLauncher {
            events: vec![
                LaunchEvent::Connected,
                finished(
                    RepairStep::CheckHealth,
                    StepResult::Failed {
                        code: Some(0x800F_082F),
                        kind: RepairErrorKind::RebootPending,
                        detail: "pendente".into(),
                    },
                ),
                LaunchEvent::Message(HelperMessage::Finished),
            ],
            error: None,
            expect_cancel: false,
        };
        let report = run_repair(&db, &run, &launcher, "run-4", 1).unwrap();
        assert_eq!(report.outcome, RepairOutcome::Failure);
    }

    #[test]
    fn cancel_reaches_the_launcher() {
        let db = Database::open_in_memory().unwrap();
        let run = WindowsRepairRun::new();
        assert!(!run.request_cancel().unwrap(), "nada rodando");

        struct CancellingLauncher<'a>(&'a WindowsRepairRun);
        impl RepairLauncher for CancellingLauncher<'_> {
            fn run(
                &self,
                on_event: &mut dyn FnMut(LaunchEvent),
                cancel: &AtomicBool,
            ) -> AppResult<()> {
                on_event(LaunchEvent::Connected);
                assert!(self.0.is_running());
                assert!(self.0.request_cancel().unwrap());
                assert!(cancel.load(Ordering::SeqCst));
                assert!(self.0.progress().unwrap().unwrap().cancel_requested);
                on_event(finished(RepairStep::ScanHealth, StepResult::Cancelled));
                on_event(LaunchEvent::Message(HelperMessage::Finished));
                Ok(())
            }
        }
        let report = run_repair(&db, &run, &CancellingLauncher(&run), "run-5", 1).unwrap();
        assert_eq!(report.outcome, RepairOutcome::Cancelled);
        assert_eq!(log(&db)[0].outcome, "cancelled");
    }

    #[test]
    fn only_one_run_at_a_time() {
        let db = Database::open_in_memory().unwrap();
        let run = WindowsRepairRun::new();
        struct Nested<'a>(&'a Database, &'a WindowsRepairRun);
        impl RepairLauncher for Nested<'_> {
            fn run(
                &self,
                _on_event: &mut dyn FnMut(LaunchEvent),
                _cancel: &AtomicBool,
            ) -> AppResult<()> {
                let second = FakeLauncher {
                    events: vec![],
                    error: None,
                    expect_cancel: false,
                };
                assert!(matches!(
                    run_repair(self.0, self.1, &second, "run-7", 2),
                    Err(AppError::Validation(_))
                ));
                Ok(())
            }
        }
        run_repair(&db, &run, &Nested(&db, &run), "run-6", 1).unwrap();
    }
}
