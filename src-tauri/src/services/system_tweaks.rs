//! Casos de uso dos ajustes reversíveis do Windows (4.6): aplicar, desfazer e
//! listar. Cada ajuste confere o valor atual na hora, grava, guarda o valor
//! anterior e audita (sucesso e falha). Recusa rodar com o app elevado.

use rusqlite::Connection;
use serde_json::{json, Value};

use crate::db::Database;
use crate::domain::audit::{AuditCategory, AuditOutcome, NewAuditEntry};
use crate::domain::system_settings::power::RawPowerPlan;
use crate::domain::system_tweaks::{
    check_undo, plan, SystemTweaker, TweakOutcome, TweakRecord, TweakRequest, TweakResult,
    TweakTarget, TweakValue, ELEVATED_MESSAGE, MAX_REQUESTS,
};
use crate::error::{AppError, AppResult};
use crate::repositories::{audit, system_tweaks as repository};

pub const APPLIED_ACTION: &str = "system_tweak.applied";
pub const UNDONE_ACTION: &str = "system_tweak.undone";
/// Maior histórico pedido pela tela.
pub const MAX_HISTORY: u32 = 100;

pub struct TweakContext {
    pub elevated: bool,
    /// Agora, como FILETIME (data gravada ao desligar um programa da inicialização).
    pub now_filetime: i64,
}

fn entry<'a>(
    action: &'a str,
    target: Option<&'a str>,
    outcome: AuditOutcome,
    details: Value,
) -> NewAuditEntry<'a> {
    NewAuditEntry {
        category: AuditCategory::Optimization,
        action,
        target,
        outcome,
        details: Some(details),
    }
}

/// Melhor esforço: a falha original é o erro relevante para quem chamou.
fn record_failure(
    db: &Database,
    action: &str,
    target: Option<&str>,
    mut details: Value,
    error: &AppError,
) {
    details["error"] = json!(error.to_string());
    let _ = db.with_connection(|connection| {
        audit::record(
            connection,
            &entry(action, target, AuditOutcome::Failure, details),
        )
    });
}

fn request_target(request: &TweakRequest) -> TweakTarget {
    match request {
        TweakRequest::PowerPlan { .. } => TweakTarget::ActivePowerPlan,
        TweakRequest::GameMode => TweakTarget::GameMode,
        TweakRequest::StartupItem { location, name, .. } => TweakTarget::Startup {
            location: *location,
            name: name.clone(),
        },
    }
}

fn request_label(request: &TweakRequest) -> String {
    match request {
        TweakRequest::PowerPlan { .. } => "Plano de energia".into(),
        TweakRequest::GameMode => "Modo de Jogo".into(),
        TweakRequest::StartupItem { name, .. } => name.clone(),
    }
}

fn ensure_startup_exists(tweaker: &impl SystemTweaker, target: &TweakTarget) -> AppResult<()> {
    if let TweakTarget::Startup { location, name } = target {
        if !tweaker.startup_exists(*location, name)? {
            return Err(AppError::Validation(format!(
                "“{name}” não está mais na inicialização. Leia de novo."
            )));
        }
    }
    Ok(())
}

/// Registro + auditoria na mesma transação.
fn save(
    connection: &mut Connection,
    target: &TweakTarget,
    label: &str,
    previous: &TweakValue,
    applied: &TweakValue,
) -> AppResult<i64> {
    let transaction = connection.transaction()?;
    let id = repository::insert(&transaction, target, label, previous, applied)?;
    let key = target.key();
    audit::record(
        &transaction,
        &entry(
            APPLIED_ACTION,
            Some(&key),
            AuditOutcome::Success,
            json!({ "id": id, "kind": target.kind().as_str(), "label": label, "from": previous, "to": applied }),
        ),
    )?;
    transaction.commit()?;
    Ok(id)
}

fn try_apply(
    db: &Database,
    tweaker: &impl SystemTweaker,
    request: &TweakRequest,
    plans: &Result<Vec<RawPowerPlan>, String>,
    now_filetime: i64,
) -> AppResult<TweakOutcome> {
    let planned = match request {
        TweakRequest::PowerPlan { .. } => {
            let plans = plans
                .as_ref()
                .map_err(|message| AppError::Device(message.clone()))?;
            plan(request, plans, now_filetime)?
        }
        _ => plan(request, &[], now_filetime)?,
    };
    ensure_startup_exists(tweaker, &planned.target)?;
    let current = tweaker.read(&planned.target)?;
    if current.same_effect(&planned.desired) {
        return Ok(TweakOutcome::Unchanged);
    }
    tweaker.write(&planned.target, &planned.desired)?;
    let saved = db.with_connection(|connection| {
        save(
            connection,
            &planned.target,
            &planned.label,
            &current,
            &planned.desired,
        )
    });
    match saved {
        Ok(id) => Ok(TweakOutcome::Applied { id }),
        Err(error) => {
            // Sem o registro não haveria Desfazer: volta o valor anterior.
            let _ = tweaker.write(&planned.target, &current);
            Err(error)
        }
    }
}

/// Aplica os ajustes pedidos, um a um (a falha de um não impede os outros).
pub fn apply_tweaks(
    db: &Database,
    tweaker: &impl SystemTweaker,
    requests: &[TweakRequest],
    context: &TweakContext,
) -> AppResult<Vec<TweakResult>> {
    if requests.is_empty() || requests.len() > MAX_REQUESTS {
        return Err(AppError::Validation(format!(
            "Escolha de 1 a {MAX_REQUESTS} ajustes."
        )));
    }
    if context.elevated {
        let error = AppError::Validation(ELEVATED_MESSAGE.into());
        record_failure(
            db,
            APPLIED_ACTION,
            None,
            json!({ "requests": requests.len() }),
            &error,
        );
        return Err(error);
    }
    let needs_plans = requests
        .iter()
        .any(|request| matches!(request, TweakRequest::PowerPlan { .. }));
    let plans = if needs_plans {
        tweaker.power_plans().map_err(|error| error.to_string())
    } else {
        Ok(Vec::new())
    };

    Ok(requests
        .iter()
        .map(|request| {
            let label = request_label(request);
            let outcome = match try_apply(db, tweaker, request, &plans, context.now_filetime) {
                Ok(outcome) => outcome,
                Err(error) => {
                    let key = request_target(request).key();
                    record_failure(
                        db,
                        APPLIED_ACTION,
                        Some(&key),
                        json!({ "label": label }),
                        &error,
                    );
                    TweakOutcome::Failed {
                        message: error.to_string(),
                    }
                }
            };
            TweakResult { label, outcome }
        })
        .collect())
}

fn try_undo(
    db: &Database,
    tweaker: &impl SystemTweaker,
    record: &TweakRecord,
    elevated: bool,
) -> AppResult<TweakRecord> {
    if elevated {
        return Err(AppError::Validation(ELEVATED_MESSAGE.into()));
    }
    let target = TweakTarget::parse(record.kind, &record.target)
        .ok_or_else(|| AppError::Validation("Registro de ajuste inválido.".into()))?;
    ensure_startup_exists(tweaker, &target)?;
    if let TweakValue::PowerPlan { guid, name } = &record.previous {
        let exists = tweaker
            .power_plans()?
            .iter()
            .any(|plan| plan.guid.eq_ignore_ascii_case(guid));
        if !exists {
            return Err(AppError::Validation(format!(
                "O plano “{name}” não existe mais neste PC."
            )));
        }
    }
    let current = tweaker.read(&target)?;
    check_undo(record, &current)?;
    tweaker.write(&target, &record.previous)?;

    let saved = db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        repository::mark_undone(&transaction, record.id)?;
        audit::record(
            &transaction,
            &entry(
                UNDONE_ACTION,
                Some(&record.target),
                AuditOutcome::Success,
                json!({
                    "id": record.id,
                    "kind": record.kind.as_str(),
                    "label": record.label,
                    "from": current,
                    "to": record.previous,
                }),
            ),
        )?;
        transaction.commit()?;
        repository::find(connection, record.id)
    });
    match saved {
        Ok(Some(updated)) => Ok(updated),
        Ok(None) => Err(AppError::NotFound("ajuste não encontrado")),
        Err(error) => {
            let _ = tweaker.write(&target, &current);
            Err(error)
        }
    }
}

/// Volta o valor anterior de um ajuste (só o mais recente do item e só se o
/// valor atual ainda for o que o app gravou).
pub fn undo_tweak(
    db: &Database,
    tweaker: &impl SystemTweaker,
    id: i64,
    elevated: bool,
) -> AppResult<TweakRecord> {
    let record = db
        .with_connection(|connection| repository::find(connection, id))?
        .ok_or(AppError::NotFound("ajuste não encontrado"))?;
    let result = try_undo(db, tweaker, &record, elevated);
    if let Err(error) = &result {
        record_failure(
            db,
            UNDONE_ACTION,
            Some(&record.target),
            json!({ "id": record.id, "label": record.label }),
            error,
        );
    }
    result
}

/// Ajustes mais recentes primeiro.
pub fn list_tweaks(db: &Database, limit: u32) -> AppResult<Vec<TweakRecord>> {
    let limit = limit.clamp(1, MAX_HISTORY);
    db.with_connection(|connection| repository::list_recent(connection, limit))
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::collections::HashMap;

    use super::*;
    use crate::domain::system_settings::startup::StartupLocation;
    use crate::domain::system_tweaks::approval_bytes;

    const BALANCED: &str = "381b4222-f694-41f0-9685-ff5bb260df2e";
    const HIGH: &str = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";

    /// Windows de mentira: valores por alvo, planos e programas existentes.
    struct FakeTweaker {
        values: RefCell<HashMap<String, TweakValue>>,
        plans: Vec<RawPowerPlan>,
        startup: Vec<String>,
        fail_writes: bool,
    }

    impl FakeTweaker {
        fn new() -> Self {
            let mut values = HashMap::new();
            values.insert(
                TweakTarget::ActivePowerPlan.key(),
                TweakValue::PowerPlan {
                    guid: BALANCED.into(),
                    name: "Equilibrado".into(),
                },
            );
            values.insert(
                TweakTarget::GameMode.key(),
                TweakValue::GameMode { value: Some(0) },
            );
            Self {
                values: RefCell::new(values),
                plans: vec![
                    RawPowerPlan {
                        guid: BALANCED.into(),
                        name: "Equilibrado".into(),
                    },
                    RawPowerPlan {
                        guid: HIGH.into(),
                        name: "Alto desempenho".into(),
                    },
                ],
                startup: vec!["Chat".into()],
                fail_writes: false,
            }
        }

        fn value(&self, target: &TweakTarget) -> TweakValue {
            self.read(target).unwrap()
        }
    }

    impl SystemTweaker for FakeTweaker {
        fn power_plans(&self) -> AppResult<Vec<RawPowerPlan>> {
            Ok(self.plans.clone())
        }

        fn read(&self, target: &TweakTarget) -> AppResult<TweakValue> {
            Ok(self.values.borrow().get(&target.key()).cloned().unwrap_or(
                TweakValue::StartupApproval {
                    bytes: None,
                    enabled: true,
                },
            ))
        }

        fn write(&self, target: &TweakTarget, value: &TweakValue) -> AppResult<()> {
            if self.fail_writes {
                return Err(AppError::Device("acesso negado".into()));
            }
            self.values.borrow_mut().insert(target.key(), value.clone());
            Ok(())
        }

        fn startup_exists(&self, _location: StartupLocation, name: &str) -> AppResult<bool> {
            Ok(self.startup.iter().any(|item| item == name))
        }
    }

    fn context() -> TweakContext {
        TweakContext {
            elevated: false,
            now_filetime: 133_485_408_000_000_000,
        }
    }

    fn chat(enabled: bool) -> TweakRequest {
        TweakRequest::StartupItem {
            location: StartupLocation::UserRun,
            name: "Chat".into(),
            enabled,
        }
    }

    fn chat_target() -> TweakTarget {
        TweakTarget::Startup {
            location: StartupLocation::UserRun,
            name: "Chat".into(),
        }
    }

    fn audit_log(db: &Database) -> Vec<audit::AuditEntry> {
        db.with_connection(|connection| audit::list_recent(connection, 50))
            .unwrap()
    }

    #[test]
    fn applies_saves_the_previous_value_and_audits() {
        let db = Database::open_in_memory().unwrap();
        let tweaker = FakeTweaker::new();
        let results = apply_tweaks(
            &db,
            &tweaker,
            &[
                TweakRequest::PowerPlan { guid: HIGH.into() },
                TweakRequest::GameMode,
                chat(false),
            ],
            &context(),
        )
        .unwrap();

        assert!(results
            .iter()
            .all(|result| matches!(result.outcome, TweakOutcome::Applied { .. })));
        assert_eq!(
            tweaker.value(&TweakTarget::ActivePowerPlan),
            TweakValue::PowerPlan {
                guid: HIGH.into(),
                name: "Alto desempenho".into()
            }
        );
        assert!(!tweaker
            .value(&chat_target())
            .same_effect(&TweakValue::startup_from(None).unwrap()));

        let history = list_tweaks(&db, 10).unwrap();
        assert_eq!(history.len(), 3);
        let plan = history
            .iter()
            .find(|record| record.label == "Plano de energia")
            .unwrap();
        assert_eq!(
            plan.previous,
            TweakValue::PowerPlan {
                guid: BALANCED.into(),
                name: "Equilibrado".into()
            }
        );
        let log = audit_log(&db);
        assert_eq!(log.len(), 3);
        assert!(log.iter().all(|entry| entry.action == APPLIED_ACTION
            && entry.outcome == "success"
            && entry.category == "optimization"));
        assert_eq!(log[0].target.as_deref(), Some("startup:userRun:Chat"));
        assert_eq!(log[0].details.as_ref().unwrap()["label"], "Chat");
    }

    #[test]
    fn already_at_the_target_value_changes_nothing() {
        let db = Database::open_in_memory().unwrap();
        let tweaker = FakeTweaker::new();
        let results = apply_tweaks(&db, &tweaker, &[chat(true)], &context()).unwrap();
        assert_eq!(results[0].outcome, TweakOutcome::Unchanged);
        assert!(list_tweaks(&db, 10).unwrap().is_empty());
        assert!(audit_log(&db).is_empty());
    }

    #[test]
    fn failures_are_per_item_and_audited() {
        let db = Database::open_in_memory().unwrap();
        let tweaker = FakeTweaker::new();
        let results = apply_tweaks(
            &db,
            &tweaker,
            &[
                TweakRequest::StartupItem {
                    location: StartupLocation::UserRun,
                    name: "Sumiu".into(),
                    enabled: false,
                },
                TweakRequest::StartupItem {
                    location: StartupLocation::MachineRun,
                    name: "Driver".into(),
                    enabled: false,
                },
                TweakRequest::GameMode,
            ],
            &context(),
        )
        .unwrap();

        let TweakOutcome::Failed { message } = &results[0].outcome else {
            panic!("esperava falha");
        };
        assert_eq!(
            message,
            "“Sumiu” não está mais na inicialização. Leia de novo."
        );
        assert!(matches!(results[1].outcome, TweakOutcome::Failed { .. }));
        assert!(matches!(results[2].outcome, TweakOutcome::Applied { .. }));

        let log = audit_log(&db);
        assert_eq!(
            log.iter()
                .filter(|entry| entry.outcome == "failure")
                .count(),
            2
        );
        assert_eq!(list_tweaks(&db, 10).unwrap().len(), 1);
    }

    #[test]
    fn write_errors_leave_no_record() {
        let db = Database::open_in_memory().unwrap();
        let mut tweaker = FakeTweaker::new();
        tweaker.fail_writes = true;
        let results = apply_tweaks(&db, &tweaker, &[TweakRequest::GameMode], &context()).unwrap();
        assert!(matches!(results[0].outcome, TweakOutcome::Failed { .. }));
        assert!(list_tweaks(&db, 10).unwrap().is_empty());
        assert_eq!(audit_log(&db)[0].outcome, "failure");
    }

    #[test]
    fn refuses_when_elevated() {
        let db = Database::open_in_memory().unwrap();
        let tweaker = FakeTweaker::new();
        let result = apply_tweaks(
            &db,
            &tweaker,
            &[TweakRequest::GameMode],
            &TweakContext {
                elevated: true,
                ..context()
            },
        );
        assert!(matches!(result, Err(AppError::Validation(_))));
        assert_eq!(
            tweaker.value(&TweakTarget::GameMode),
            TweakValue::GameMode { value: Some(0) }
        );
        assert_eq!(audit_log(&db)[0].outcome, "failure");
        assert!(apply_tweaks(&db, &tweaker, &[], &context()).is_err());
    }

    #[test]
    fn undo_restores_the_exact_previous_value() {
        let db = Database::open_in_memory().unwrap();
        let tweaker = FakeTweaker::new();
        apply_tweaks(
            &db,
            &tweaker,
            &[chat(false), TweakRequest::GameMode],
            &context(),
        )
        .unwrap();
        let history = list_tweaks(&db, 10).unwrap();
        let chat_record = history
            .iter()
            .find(|record| record.label == "Chat")
            .unwrap();

        let undone = undo_tweak(&db, &tweaker, chat_record.id, false).unwrap();
        assert!(undone.undone_at.is_some());
        assert_eq!(
            tweaker.value(&chat_target()),
            TweakValue::StartupApproval {
                bytes: None,
                enabled: true
            }
        );
        let game = history
            .iter()
            .find(|record| record.label == "Modo de Jogo")
            .unwrap();
        undo_tweak(&db, &tweaker, game.id, false).unwrap();
        assert_eq!(
            tweaker.value(&TweakTarget::GameMode),
            TweakValue::GameMode { value: Some(0) }
        );

        let log = audit_log(&db);
        assert_eq!(log[0].action, UNDONE_ACTION);
        assert_eq!(log[0].outcome, "success");
        // Desfazer de novo: recusado e auditado.
        assert!(undo_tweak(&db, &tweaker, chat_record.id, false).is_err());
        assert_eq!(audit_log(&db)[0].outcome, "failure");
    }

    #[test]
    fn undo_refuses_when_changed_outside_the_app() {
        let db = Database::open_in_memory().unwrap();
        let tweaker = FakeTweaker::new();
        apply_tweaks(&db, &tweaker, &[chat(false)], &context()).unwrap();
        let id = list_tweaks(&db, 1).unwrap()[0].id;

        // O usuário religou pelo Gerenciador de Tarefas.
        tweaker
            .write(
                &chat_target(),
                &TweakValue::startup_from(Some(&approval_bytes(true, 0))).unwrap(),
            )
            .unwrap();
        let Err(AppError::Validation(message)) = undo_tweak(&db, &tweaker, id, false) else {
            panic!("esperava recusa");
        };
        assert!(message.starts_with("O valor mudou fora do app"));
        assert!(list_tweaks(&db, 1).unwrap()[0].undone_at.is_none());
    }

    #[test]
    fn only_the_latest_change_can_be_undone() {
        let db = Database::open_in_memory().unwrap();
        let tweaker = FakeTweaker::new();
        apply_tweaks(&db, &tweaker, &[chat(false)], &context()).unwrap();
        apply_tweaks(&db, &tweaker, &[chat(true)], &context()).unwrap();
        let history = list_tweaks(&db, 10).unwrap();
        assert!(history[0].undoable);
        assert!(!history[1].undoable);
        assert!(undo_tweak(&db, &tweaker, history[1].id, false).is_err());
        assert!(undo_tweak(&db, &tweaker, history[0].id, false).is_ok());
        assert!(matches!(
            undo_tweak(&db, &tweaker, 999, false),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn undo_needs_the_previous_plan() {
        let db = Database::open_in_memory().unwrap();
        let mut tweaker = FakeTweaker::new();
        apply_tweaks(
            &db,
            &tweaker,
            &[TweakRequest::PowerPlan { guid: HIGH.into() }],
            &context(),
        )
        .unwrap();
        let id = list_tweaks(&db, 1).unwrap()[0].id;
        tweaker.plans.retain(|plan| plan.guid != BALANCED);
        let Err(AppError::Validation(message)) = undo_tweak(&db, &tweaker, id, false) else {
            panic!("esperava recusa");
        };
        assert_eq!(message, "O plano “Equilibrado” não existe mais neste PC.");
    }
}
