//! Casos de uso de tarefas: validação, transações e auditoria da exclusão.

use rusqlite::Connection;
use serde_json::json;

use crate::db::Database;
use crate::domain::audit::{AuditCategory, AuditOutcome, NewAuditEntry};
use crate::domain::tasks::{Task, TaskInput, TaskStatus};
use crate::error::{AppError, AppResult};
use crate::repositories::{audit, tasks};

const ACTION_DELETED: &str = "task.deleted";

pub fn list_tasks(db: &Database) -> AppResult<Vec<Task>> {
    db.with_connection(|connection| tasks::list(connection))
}

pub fn list_tags(db: &Database) -> AppResult<Vec<String>> {
    db.with_connection(|connection| tasks::list_tags(connection))
}

pub fn create_task(db: &Database, input: TaskInput) -> AppResult<Task> {
    let task = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let id = tasks::insert(&transaction, &task)?;
        let created = load(&transaction, id)?;
        transaction.commit()?;
        Ok(created)
    })
}

pub fn update_task(db: &Database, id: i64, input: TaskInput) -> AppResult<Task> {
    let task = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        tasks::update(&transaction, id, &task)?;
        let updated = load(&transaction, id)?;
        transaction.commit()?;
        Ok(updated)
    })
}

pub fn move_task(
    db: &Database,
    id: i64,
    status: TaskStatus,
    before_id: Option<i64>,
) -> AppResult<Task> {
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        tasks::move_to(&transaction, id, status, before_id)?;
        let moved = load(&transaction, id)?;
        transaction.commit()?;
        Ok(moved)
    })
}

/// Exclusão definitiva. A confirmação acontece na interface; aqui a operação é
/// registrada no log de auditoria (sucesso e falha).
pub fn delete_task(db: &Database, id: i64) -> AppResult<()> {
    db.with_connection(|connection| {
        let result = delete_with_audit(connection, id);
        if let Err(error) = &result {
            let target = id.to_string();
            // Melhor esforço: a falha original é o erro relevante para o chamador.
            let _ = audit::record(
                connection,
                &NewAuditEntry {
                    category: AuditCategory::Tasks,
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

fn delete_with_audit(connection: &mut Connection, id: i64) -> AppResult<()> {
    let transaction = connection.transaction()?;
    let title = tasks::delete(&transaction, id)?;
    let target = id.to_string();
    audit::record(
        &transaction,
        &NewAuditEntry {
            category: AuditCategory::Tasks,
            action: ACTION_DELETED,
            target: Some(&target),
            outcome: AuditOutcome::Success,
            details: Some(json!({ "title": title })),
        },
    )?;
    transaction.commit()?;
    Ok(())
}

fn load(connection: &Connection, id: i64) -> AppResult<Task> {
    tasks::find(connection, id)?.ok_or(AppError::NotFound("tarefa não encontrada"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::tasks::TaskPriority;

    fn input(title: &str) -> TaskInput {
        TaskInput {
            title: title.into(),
            description: String::new(),
            status: TaskStatus::Todo,
            priority: TaskPriority::High,
            due_date: None,
            tags: vec!["Trabalho".into()],
        }
    }

    fn audit_log(db: &Database) -> Vec<audit::AuditEntry> {
        db.with_connection(|connection| audit::list_recent(connection, 10))
            .unwrap()
    }

    #[test]
    fn create_validates_and_normalizes() {
        let db = Database::open_in_memory().unwrap();
        let task = create_task(&db, input("  Relatório  ")).unwrap();

        assert_eq!(task.title, "Relatório");
        assert_eq!(task.tags, vec!["trabalho"]);
        assert!(matches!(
            create_task(&db, input(" ")),
            Err(AppError::Validation(_))
        ));
        assert_eq!(list_tasks(&db).unwrap().len(), 1);
    }

    #[test]
    fn delete_is_audited() {
        let db = Database::open_in_memory().unwrap();
        let task = create_task(&db, input("Tarefa antiga")).unwrap();

        delete_task(&db, task.id).unwrap();

        assert!(list_tasks(&db).unwrap().is_empty());
        let log = audit_log(&db);
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].category, "tasks");
        assert_eq!(log[0].action, ACTION_DELETED);
        assert_eq!(log[0].outcome, "success");
        assert_eq!(log[0].details, Some(json!({ "title": "Tarefa antiga" })));
    }

    #[test]
    fn failed_delete_is_audited_as_failure() {
        let db = Database::open_in_memory().unwrap();

        assert!(matches!(delete_task(&db, 42), Err(AppError::NotFound(_))));

        let log = audit_log(&db);
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].outcome, "failure");
        assert_eq!(log[0].target.as_deref(), Some("42"));
    }

    #[test]
    fn move_returns_the_updated_task() {
        let db = Database::open_in_memory().unwrap();
        let task = create_task(&db, input("Mover")).unwrap();

        let moved = move_task(&db, task.id, TaskStatus::Done, None).unwrap();

        assert_eq!(moved.status, TaskStatus::Done);
        assert!(moved.completed_at.is_some());
    }
}
