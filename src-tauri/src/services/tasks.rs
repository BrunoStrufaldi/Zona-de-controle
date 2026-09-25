//! Casos de uso de tarefas: validação, transações, recorrência e auditoria da exclusão.

use rusqlite::Connection;
use serde_json::json;

use crate::db::Database;
use crate::domain::audit::{AuditCategory, AuditOutcome, NewAuditEntry};
use crate::domain::calendar::CalendarDate;
use crate::domain::tasks::{
    ChecklistItemInput, Task, TaskChange, TaskInput, TaskStatus, ValidTask,
};
use crate::error::{AppError, AppResult};
use crate::repositories::{audit, clock, tasks};

const ACTION_DELETED: &str = "task.deleted";

pub fn list_tasks(db: &Database) -> AppResult<Vec<Task>> {
    db.with_connection(|connection| tasks::list(connection))
}

pub fn list_archived_tasks(db: &Database) -> AppResult<Vec<Task>> {
    db.with_connection(|connection| tasks::list_archived(connection))
}

pub fn list_tags(db: &Database) -> AppResult<Vec<String>> {
    db.with_connection(|connection| tasks::list_tags(connection))
}

pub fn create_task(db: &Database, input: TaskInput) -> AppResult<TaskChange> {
    let task = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let id = tasks::insert(&transaction, &task)?;
        let change = finish_change(&transaction, id, None)?;
        transaction.commit()?;
        Ok(change)
    })
}

pub fn update_task(db: &Database, id: i64, input: TaskInput) -> AppResult<TaskChange> {
    let task = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let before = load(&transaction, id)?.status;
        tasks::update(&transaction, id, &task)?;
        let change = finish_change(&transaction, id, Some(before))?;
        transaction.commit()?;
        Ok(change)
    })
}

pub fn move_task(
    db: &Database,
    id: i64,
    status: TaskStatus,
    before_id: Option<i64>,
) -> AppResult<TaskChange> {
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let before = load(&transaction, id)?.status;
        tasks::move_to(&transaction, id, status, before_id)?;
        let change = finish_change(&transaction, id, Some(before))?;
        transaction.commit()?;
        Ok(change)
    })
}

pub fn set_checklist_item_done(db: &Database, item_id: i64, done: bool) -> AppResult<Task> {
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let task_id = tasks::set_checklist_item_done(&transaction, item_id, done)?;
        let task = load(&transaction, task_id)?;
        transaction.commit()?;
        Ok(task)
    })
}

/// Arquivar não apaga nada: a tarefa sai das listas e pode ser restaurada.
pub fn archive_task(db: &Database, id: i64) -> AppResult<Task> {
    db.with_connection(|connection| {
        tasks::archive(connection, id)?;
        load(connection, id)
    })
}

/// Arquiva todas as concluídas. Retorna quantas foram arquivadas.
pub fn archive_completed_tasks(db: &Database) -> AppResult<usize> {
    db.with_connection(|connection| tasks::archive_done(connection))
}

pub fn restore_task(db: &Database, id: i64) -> AppResult<Task> {
    db.with_connection(|connection| {
        tasks::restore(connection, id)?;
        load(connection, id)
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

/// Carrega o resultado de uma alteração. Se a tarefa acabou de ser concluída
/// (`previous` diferente de "Feito") e é recorrente, cria a próxima ocorrência.
fn finish_change(
    connection: &Connection,
    id: i64,
    previous: Option<TaskStatus>,
) -> AppResult<TaskChange> {
    let task = load(connection, id)?;
    let just_completed = task.status == TaskStatus::Done && previous != Some(TaskStatus::Done);
    if !just_completed || task.recurrence.is_none() {
        return Ok(TaskChange {
            task,
            next_occurrence: None,
        });
    }

    let next_id = create_next_occurrence(connection, &task)?;
    Ok(TaskChange {
        task: load(connection, id)?,
        next_occurrence: Some(load(connection, next_id)?),
    })
}

/// Cria a próxima ocorrência (mesmos dados, checklist desmarcada, status
/// "A fazer") e move a regra para ela — reabrir e concluir de novo a tarefa
/// original não gera duplicatas.
fn create_next_occurrence(connection: &Connection, task: &Task) -> AppResult<i64> {
    let invalid_date = || AppError::Validation("data inválida na tarefa recorrente".into());
    let recurrence = task.recurrence.clone().ok_or_else(invalid_date)?;
    let today = clock::local_today(connection)?;
    let due = match task.due_date.as_deref() {
        Some(date) => CalendarDate::parse(date).ok_or_else(invalid_date)?,
        None => today,
    };

    let next = ValidTask {
        title: task.title.clone(),
        description: task.description.clone(),
        status: TaskStatus::Todo,
        priority: task.priority,
        due_date: Some(recurrence.next_occurrence(due, today).to_string()),
        tags: task.tags.clone(),
        category_id: task.category_id,
        recurrence: Some(recurrence),
        checklist: task
            .checklist
            .iter()
            .map(|item| ChecklistItemInput {
                text: item.text.clone(),
                done: false,
            })
            .collect(),
    };
    let next_id = tasks::insert(connection, &next)?;
    tasks::clear_recurrence(connection, task.id)?;
    Ok(next_id)
}

fn load(connection: &Connection, id: i64) -> AppResult<Task> {
    tasks::find(connection, id)?.ok_or(AppError::NotFound("tarefa não encontrada"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::task_recurrence::{Recurrence, RecurrenceFrequency};
    use crate::domain::tasks::TaskPriority;

    fn input(title: &str) -> TaskInput {
        TaskInput {
            title: title.into(),
            description: String::new(),
            status: TaskStatus::Todo,
            priority: TaskPriority::High,
            due_date: None,
            tags: vec!["Trabalho".into()],
            category_id: None,
            recurrence: None,
            checklist: Vec::new(),
        }
    }

    /// Tarefa semanal com vencimento distante, para não depender da data de hoje.
    fn weekly_input(title: &str) -> TaskInput {
        TaskInput {
            due_date: Some("2999-01-07".into()),
            recurrence: Some(Recurrence {
                frequency: RecurrenceFrequency::Weekly,
                interval: 1,
                weekdays: Vec::new(),
            }),
            checklist: vec![ChecklistItemInput {
                text: "Separar lixo reciclável".into(),
                done: true,
            }],
            ..input(title)
        }
    }

    fn audit_log(db: &Database) -> Vec<audit::AuditEntry> {
        db.with_connection(|connection| audit::list_recent(connection, 10))
            .unwrap()
    }

    #[test]
    fn create_validates_and_normalizes() {
        let db = Database::open_in_memory().unwrap();
        let task = create_task(&db, input("  Relatório  ")).unwrap().task;

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
        let task = create_task(&db, input("Tarefa antiga")).unwrap().task;

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
        let task = create_task(&db, input("Mover")).unwrap().task;

        let change = move_task(&db, task.id, TaskStatus::Done, None).unwrap();

        assert_eq!(change.task.status, TaskStatus::Done);
        assert!(change.task.completed_at.is_some());
        assert!(change.next_occurrence.is_none());
    }

    #[test]
    fn completing_a_recurring_task_creates_the_next_occurrence() {
        let db = Database::open_in_memory().unwrap();
        let task = create_task(&db, weekly_input("Levar o lixo")).unwrap().task;

        let change = move_task(&db, task.id, TaskStatus::Done, None).unwrap();

        let next = change.next_occurrence.expect("próxima ocorrência");
        assert_eq!(next.title, "Levar o lixo");
        assert_eq!(next.status, TaskStatus::Todo);
        assert_eq!(next.due_date.as_deref(), Some("2999-01-14"));
        assert_eq!(next.tags, vec!["trabalho"]);
        assert!(next.recurrence.is_some());
        assert!(!next.checklist[0].done, "checklist recomeça desmarcada");
        // A regra passa para a nova tarefa.
        assert!(change.task.recurrence.is_none());

        // Reabrir e concluir de novo não duplica a ocorrência.
        move_task(&db, task.id, TaskStatus::Todo, None).unwrap();
        let again = move_task(&db, task.id, TaskStatus::Done, None).unwrap();
        assert!(again.next_occurrence.is_none());
        assert_eq!(list_tasks(&db).unwrap().len(), 2);
    }

    #[test]
    fn completing_through_the_form_also_recurs() {
        let db = Database::open_in_memory().unwrap();
        let task = create_task(&db, weekly_input("Backup")).unwrap().task;

        let mut done = weekly_input("Backup");
        done.status = TaskStatus::Done;
        let change = update_task(&db, task.id, done.clone()).unwrap();
        assert!(change.next_occurrence.is_some());

        // Salvar de novo uma tarefa já concluída não gera outra ocorrência.
        let resaved = update_task(&db, task.id, done).unwrap();
        assert!(resaved.next_occurrence.is_none());
    }

    #[test]
    fn archive_and_restore_round_trip() {
        let db = Database::open_in_memory().unwrap();
        let task = create_task(&db, input("Arquivar")).unwrap().task;
        move_task(&db, task.id, TaskStatus::Done, None).unwrap();

        assert_eq!(archive_completed_tasks(&db).unwrap(), 1);
        assert!(list_tasks(&db).unwrap().is_empty());
        assert_eq!(list_archived_tasks(&db).unwrap().len(), 1);

        let restored = restore_task(&db, task.id).unwrap();
        assert!(restored.archived_at.is_none());
        assert!(archive_task(&db, task.id).unwrap().archived_at.is_some());
        assert!(matches!(
            set_checklist_item_done(&db, 1, true),
            Err(AppError::NotFound(_))
        ));
    }
}
