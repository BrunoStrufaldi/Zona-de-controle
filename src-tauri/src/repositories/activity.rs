//! SQL das atividades recentes: tarefas concluídas, hábitos marcados e
//! lançamentos criados no app, mais recentes primeiro (somente leitura).

use rusqlite::{params, Connection};

use crate::domain::activity::{ActivityDetail, ActivityEntry};
use crate::error::AppResult;

pub fn completed_tasks(connection: &Connection, limit: u32) -> AppResult<Vec<ActivityEntry>> {
    let mut statement = connection.prepare(
        "SELECT id, title, completed_at FROM tasks
         WHERE completed_at IS NOT NULL
         ORDER BY completed_at DESC, id DESC
         LIMIT ?1",
    )?;
    let rows = statement.query_map(params![limit], |row| {
        let id: i64 = row.get(0)?;
        Ok(ActivityEntry {
            id: format!("task:{id}"),
            occurred_at: row.get(2)?,
            detail: ActivityDetail::TaskCompleted {
                task_id: id,
                title: row.get(1)?,
            },
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn done_habits(connection: &Connection, limit: u32) -> AppResult<Vec<ActivityEntry>> {
    let mut statement = connection.prepare(
        "SELECT c.habit_id, c.date, c.completed_at, h.name, r.name
         FROM habit_completions c
         JOIN habits h ON h.id = c.habit_id
         JOIN routines r ON r.id = h.routine_id
         ORDER BY c.completed_at DESC, c.habit_id DESC
         LIMIT ?1",
    )?;
    let rows = statement.query_map(params![limit], |row| {
        let habit_id: i64 = row.get(0)?;
        let date: String = row.get(1)?;
        Ok(ActivityEntry {
            id: format!("habit:{habit_id}:{date}"),
            occurred_at: row.get(2)?,
            detail: ActivityDetail::HabitDone {
                habit: row.get(3)?,
                routine: row.get(4)?,
                date,
            },
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Só os criados no app: os importados aparecem como a importação.
pub fn created_transactions(connection: &Connection, limit: u32) -> AppResult<Vec<ActivityEntry>> {
    let mut statement = connection.prepare(
        "SELECT id, description, kind, amount, created_at FROM finance_transactions
         WHERE external_id IS NULL
         ORDER BY created_at DESC, id DESC
         LIMIT ?1",
    )?;
    let rows = statement.query_map(params![limit], |row| {
        let id: i64 = row.get(0)?;
        Ok(ActivityEntry {
            id: format!("transaction:{id}"),
            occurred_at: row.get(4)?,
            detail: ActivityDetail::TransactionCreated {
                description: row.get(1)?,
                transaction_kind: row.get(2)?,
                amount: row.get(3)?,
            },
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}
