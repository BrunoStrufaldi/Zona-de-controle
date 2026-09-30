//! Atividades recentes do dashboard (somente leitura): junta tarefas
//! concluídas, hábitos marcados, lançamentos criados, limpezas e importações.

use crate::db::Database;
use crate::domain::activity::{
    cleanup_activity, import_activity, merge, ActivityEntry, ACTIVITY_MAX,
};
use crate::domain::audit::AuditCategory;
use crate::domain::optimization::CLEANUP_AUDIT_ACTION;
use crate::error::{AppError, AppResult};
use crate::repositories::{activity as repository, audit};
use crate::services::finance_import::IMPORT_AUDIT_ACTION;

pub fn list_recent_activity(db: &Database, limit: u32) -> AppResult<Vec<ActivityEntry>> {
    if limit == 0 || limit > ACTIVITY_MAX {
        return Err(AppError::Validation(format!(
            "Peça de 1 a {ACTIVITY_MAX} atividades por vez."
        )));
    }
    db.with_connection(|connection| {
        // Cada fonte traz até `limit`: o suficiente para o resultado final.
        let from_audit = |category,
                          action,
                          read: fn(
            i64,
            &str,
            &str,
            Option<&serde_json::Value>,
        ) -> Option<ActivityEntry>| {
            Ok::<_, AppError>(
                audit::list_by_action(connection, category, action, limit)?
                    .iter()
                    .filter_map(|entry| {
                        read(
                            entry.id,
                            &entry.occurred_at,
                            &entry.outcome,
                            entry.details.as_ref(),
                        )
                    })
                    .collect(),
            )
        };
        Ok(merge(
            vec![
                repository::completed_tasks(connection, limit)?,
                repository::done_habits(connection, limit)?,
                repository::created_transactions(connection, limit)?,
                from_audit(
                    AuditCategory::Optimization,
                    CLEANUP_AUDIT_ACTION,
                    cleanup_activity,
                )?,
                from_audit(AuditCategory::Finance, IMPORT_AUDIT_ACTION, import_activity)?,
            ],
            limit as usize,
        ))
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::domain::activity::ActivityDetail;
    use crate::domain::audit::{AuditOutcome, NewAuditEntry};

    #[test]
    fn joins_every_module_newest_first() {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| {
            connection.execute_batch(
                "INSERT INTO tasks (title, status, completed_at) VALUES
                     ('Enviar relatório', 'done', '2026-09-25T11:45:00.000Z'),
                     ('Aberta', 'todo', NULL);
                 INSERT INTO routines (name, weekdays, start_date) VALUES ('Manhã', 127, '2026-09-01');
                 INSERT INTO habits (routine_id, name, position, created_on) VALUES (1, 'Pular corda', 0, '2026-09-01');
                 INSERT INTO habit_completions (habit_id, date, completed_at)
                     VALUES (1, '2026-09-24', '2026-09-24T10:30:00.000Z');
                 INSERT INTO finance_accounts (name, kind, color) VALUES ('C6', 'checking', 'slate');
                 INSERT INTO finance_transactions (account_id, kind, description, amount, date, status, created_at)
                     VALUES (1, 'expense', 'Internet', 9990, '2026-09-24', 'paid', '2026-09-24T22:20:00.000Z');
                 INSERT INTO finance_transactions (account_id, kind, description, amount, date, status, external_id, created_at)
                     VALUES (1, 'expense', 'Importada', 100, '2026-09-24', 'paid', 'ofx:1:2', '2026-09-26T00:00:00.000Z');",
            )?;
            let record = |category, action, outcome, details| {
                audit::record(
                    connection,
                    &NewAuditEntry {
                        category,
                        action,
                        target: None,
                        outcome,
                        details: Some(details),
                    },
                )
            };
            record(
                AuditCategory::Optimization,
                CLEANUP_AUDIT_ACTION,
                AuditOutcome::Success,
                json!({ "removedBytes": 2048 }),
            )?;
            record(
                AuditCategory::Finance,
                IMPORT_AUDIT_ACTION,
                AuditOutcome::Failure,
                json!({ "error": "arquivo inválido" }),
            )?;
            Ok(())
        })
        .unwrap();

        let entries = list_recent_activity(&db, 10).unwrap();
        let kinds: Vec<&str> = entries
            .iter()
            .map(|entry| match entry.detail {
                ActivityDetail::TaskCompleted { .. } => "task",
                ActivityDetail::HabitDone { .. } => "habit",
                ActivityDetail::TransactionCreated { .. } => "transaction",
                ActivityDetail::CleanupRun { .. } => "cleanup",
                ActivityDetail::StatementImported { .. } => "import",
            })
            .collect();
        // A limpeza foi gravada agora (mais recente); a importação falhou e o
        // lançamento importado fica de fora.
        assert_eq!(kinds, ["cleanup", "task", "transaction", "habit"]);

        assert_eq!(list_recent_activity(&db, 2).unwrap().len(), 2);
        assert!(list_recent_activity(&db, 0).is_err());
        assert!(list_recent_activity(&db, ACTIVITY_MAX + 1).is_err());
    }
}
