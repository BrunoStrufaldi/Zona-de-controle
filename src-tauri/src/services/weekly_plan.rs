//! Casos de uso do planejamento semanal: listagem, criação e edição (sem
//! sobreposição de horários no mesmo dia) e exclusão auditada.

use rusqlite::Connection;
use serde_json::json;

use crate::db::Database;
use crate::domain::audit::{AuditCategory, AuditOutcome, NewAuditEntry};
use crate::domain::weekly_plan::{
    conflict_message, find_conflict, PlanBlock, PlanBlockInput, ValidBlock, MAX_BLOCKS,
};
use crate::error::{AppError, AppResult};
use crate::repositories::audit;
use crate::repositories::weekly_plan as repository;

const ACTION_DELETED: &str = "weekly_block.deleted";

pub fn list_weekly_plan(db: &Database) -> AppResult<Vec<PlanBlock>> {
    db.with_connection(|connection| repository::list(connection))
}

fn ensure_no_conflict(
    connection: &Connection,
    block: &ValidBlock,
    editing: Option<i64>,
) -> AppResult<()> {
    let blocks = repository::list(connection)?;
    match find_conflict(block, editing, &blocks) {
        Some((other, day)) => Err(AppError::Validation(conflict_message(other, day))),
        None => Ok(()),
    }
}

pub fn create_plan_block(db: &Database, input: PlanBlockInput) -> AppResult<PlanBlock> {
    let block = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        if repository::count(&transaction)? >= MAX_BLOCKS {
            return Err(AppError::Validation(format!(
                "o planejamento pode ter no máximo {MAX_BLOCKS} blocos"
            )));
        }
        ensure_no_conflict(&transaction, &block, None)?;
        let id = repository::insert(&transaction, &block)?;
        let created = repository::find(&transaction, id)?;
        transaction.commit()?;
        Ok(created)
    })
}

pub fn update_plan_block(db: &Database, id: i64, input: PlanBlockInput) -> AppResult<PlanBlock> {
    let block = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        repository::find(&transaction, id)?;
        ensure_no_conflict(&transaction, &block, Some(id))?;
        repository::update(&transaction, id, &block)?;
        let updated = repository::find(&transaction, id)?;
        transaction.commit()?;
        Ok(updated)
    })
}

/// Exclusão definitiva (destrutiva): o bloco sai e o registro fica no log.
pub fn delete_plan_block(db: &Database, id: i64) -> AppResult<()> {
    db.with_connection(|connection| {
        let target = id.to_string();
        let result: AppResult<()> = (|| {
            let transaction = connection.transaction()?;
            let block = repository::delete(&transaction, id)?;
            audit::record(
                &transaction,
                &NewAuditEntry {
                    category: AuditCategory::Routines,
                    action: ACTION_DELETED,
                    target: Some(&target),
                    outcome: AuditOutcome::Success,
                    details: Some(json!({
                        "title": block.title,
                        "weekdays": block.weekdays,
                        "startTime": block.start_time,
                        "endTime": block.end_time,
                    })),
                },
            )?;
            transaction.commit()?;
            Ok(())
        })();
        if let Err(error) = &result {
            // Melhor esforço: a falha original é o erro relevante para o chamador.
            let _ = audit::record(
                connection,
                &NewAuditEntry {
                    category: AuditCategory::Routines,
                    action: ACTION_DELETED,
                    target: Some(&target),
                    outcome: AuditOutcome::Failure,
                    details: Some(json!({ "error": error.to_string() })),
                },
            );
        }
        result
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::task_categories::CategoryColor;

    fn input(title: &str, days: &[u8], span: Option<(&str, &str)>) -> PlanBlockInput {
        PlanBlockInput {
            title: title.into(),
            notes: String::new(),
            weekdays: days.to_vec(),
            start_time: span.map(|(start, _)| start.into()),
            end_time: span.map(|(_, end)| end.into()),
            color: CategoryColor::Blue,
        }
    }

    #[test]
    fn creates_and_edits_without_overlapping_blocks() {
        let db = Database::open_in_memory().unwrap();
        let work = create_plan_block(&db, input("Trabalho", &[1, 3, 5], Some(("08:00", "15:00"))))
            .unwrap();
        create_plan_block(&db, input("Academia", &[3], Some(("16:30", "18:00")))).unwrap();

        let error = create_plan_block(&db, input("Inglês", &[3], Some(("15:00", "17:00"))))
            .unwrap_err()
            .to_string();
        assert!(error.contains("“Academia” na quarta"), "{error}");

        // Editar o próprio bloco não conflita com ele mesmo.
        let moved = update_plan_block(
            &db,
            work.id,
            input("Trabalho", &[1, 3, 5], Some(("07:30", "15:30"))),
        )
        .unwrap();
        assert_eq!(moved.start_time.as_deref(), Some("07:30"));
        assert!(update_plan_block(
            &db,
            work.id,
            input("Trabalho", &[3], Some(("08:00", "17:00")))
        )
        .is_err());
        assert_eq!(list_weekly_plan(&db).unwrap().len(), 2);
        assert!(matches!(
            update_plan_block(&db, 999, input("x", &[1], None)),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn deleting_is_audited_on_success_and_failure() {
        let db = Database::open_in_memory().unwrap();
        let block = create_plan_block(&db, input("Descanso", &[0], None)).unwrap();
        delete_plan_block(&db, block.id).unwrap();
        assert!(delete_plan_block(&db, block.id).is_err());
        assert!(list_weekly_plan(&db).unwrap().is_empty());

        let log = db
            .with_connection(|connection| {
                audit::list_by_action(connection, AuditCategory::Routines, ACTION_DELETED, 10)
            })
            .unwrap();
        let outcomes: Vec<&str> = log.iter().map(|entry| entry.outcome.as_str()).collect();
        assert_eq!(outcomes, ["failure", "success"]);
        assert_eq!(log[1].details.as_ref().unwrap()["title"], "Descanso");
    }
}
