//! Casos de uso das categorias de tarefas. A exclusão é auditada.

use rusqlite::Connection;
use serde_json::json;

use crate::db::Database;
use crate::domain::audit::{AuditCategory, AuditOutcome, NewAuditEntry};
use crate::domain::task_categories::{TaskCategory, TaskCategoryInput, MAX_CATEGORIES};
use crate::error::{AppError, AppResult};
use crate::repositories::task_categories::CATEGORY_NOT_FOUND;
use crate::repositories::{audit, task_categories};

const ACTION_DELETED: &str = "task_category.deleted";

pub fn list_categories(db: &Database) -> AppResult<Vec<TaskCategory>> {
    db.with_connection(|connection| task_categories::list(connection))
}

pub fn create_category(db: &Database, input: TaskCategoryInput) -> AppResult<TaskCategory> {
    let category = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        if task_categories::count(&transaction)? >= MAX_CATEGORIES {
            return Err(AppError::Validation(format!(
                "é possível ter no máximo {MAX_CATEGORIES} categorias"
            )));
        }
        let id = task_categories::insert(&transaction, &category)?;
        let created = load(&transaction, id)?;
        transaction.commit()?;
        Ok(created)
    })
}

pub fn update_category(
    db: &Database,
    id: i64,
    input: TaskCategoryInput,
) -> AppResult<TaskCategory> {
    let category = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        task_categories::update(&transaction, id, &category)?;
        let updated = load(&transaction, id)?;
        transaction.commit()?;
        Ok(updated)
    })
}

/// Exclusão definitiva da categoria (as tarefas ficam sem categoria). A
/// interface pede confirmação; sucesso e falha vão para o log de auditoria.
pub fn delete_category(db: &Database, id: i64) -> AppResult<()> {
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
    let (name, task_count) = task_categories::delete(&transaction, id)?;
    let target = id.to_string();
    audit::record(
        &transaction,
        &NewAuditEntry {
            category: AuditCategory::Tasks,
            action: ACTION_DELETED,
            target: Some(&target),
            outcome: AuditOutcome::Success,
            details: Some(json!({ "name": name, "tasksDetached": task_count })),
        },
    )?;
    transaction.commit()?;
    Ok(())
}

fn load(connection: &Connection, id: i64) -> AppResult<TaskCategory> {
    task_categories::find(connection, id)?.ok_or(AppError::NotFound(CATEGORY_NOT_FOUND))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::task_categories::CategoryColor;

    fn input(name: &str) -> TaskCategoryInput {
        TaskCategoryInput {
            name: name.into(),
            color: CategoryColor::Amber,
        }
    }

    #[test]
    fn creates_and_updates() {
        let db = Database::open_in_memory().unwrap();
        let created = create_category(&db, input("  Saúde ")).unwrap();
        assert_eq!(created.name, "Saúde");
        assert_eq!(created.task_count, 0);

        let updated = update_category(
            &db,
            created.id,
            TaskCategoryInput {
                name: "Saúde e bem-estar".into(),
                color: CategoryColor::Pink,
            },
        )
        .unwrap();
        assert_eq!(updated.color, CategoryColor::Pink);
        assert!(matches!(
            create_category(&db, input(" ")),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn limits_the_number_of_categories() {
        let db = Database::open_in_memory().unwrap();
        for index in 0..MAX_CATEGORIES {
            create_category(&db, input(&format!("Categoria {index}"))).unwrap();
        }
        assert!(matches!(
            create_category(&db, input("Uma a mais")),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn delete_is_audited_on_success_and_failure() {
        let db = Database::open_in_memory().unwrap();
        let category = create_category(&db, input("Viagem")).unwrap();

        delete_category(&db, category.id).unwrap();
        assert!(matches!(
            delete_category(&db, category.id),
            Err(AppError::NotFound(_))
        ));

        let log = db
            .with_connection(|connection| audit::list_recent(connection, 10))
            .unwrap();
        assert_eq!(log.len(), 2);
        assert_eq!(log[0].outcome, "failure");
        assert_eq!(log[1].action, ACTION_DELETED);
        assert_eq!(
            log[1].details,
            Some(json!({ "name": "Viagem", "tasksDetached": 0 }))
        );
        assert!(list_categories(&db).unwrap().is_empty());
    }
}
