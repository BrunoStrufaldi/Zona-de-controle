//! Acesso às tabelas `tasks`, `tags` e `task_tags`.

use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::domain::tasks::{Task, TaskPriority, TaskStatus, ValidTask};
use crate::error::{AppError, AppResult};

const TASK_NOT_FOUND: &str = "tarefa não encontrada";

/// Menor distância entre posições antes de renumerar a coluna.
const MIN_POSITION_GAP: f64 = 1e-6;

const SELECT_TASK: &str = "SELECT id, title, description, status, priority, due_date,
       position, completed_at, created_at, updated_at
FROM tasks";

/// Linha crua do banco; status/prioridade são convertidos fora do mapeamento
/// para reportar valores inválidos como `AppError`.
struct TaskRow {
    id: i64,
    title: String,
    description: String,
    status: String,
    priority: String,
    due_date: Option<String>,
    position: f64,
    completed_at: Option<String>,
    created_at: String,
    updated_at: String,
}

impl TaskRow {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            title: row.get(1)?,
            description: row.get(2)?,
            status: row.get(3)?,
            priority: row.get(4)?,
            due_date: row.get(5)?,
            position: row.get(6)?,
            completed_at: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    }

    fn into_task(self, tags: Vec<String>) -> AppResult<Task> {
        Ok(Task {
            id: self.id,
            title: self.title,
            description: self.description,
            status: TaskStatus::parse(&self.status)?,
            priority: TaskPriority::parse(&self.priority)?,
            due_date: self.due_date,
            position: self.position,
            tags,
            completed_at: self.completed_at,
            created_at: self.created_at,
            updated_at: self.updated_at,
        })
    }
}

/// Todas as tarefas, agrupadas por status e ordenadas pela posição.
pub fn list(connection: &Connection) -> AppResult<Vec<Task>> {
    let mut statement =
        connection.prepare(&format!("{SELECT_TASK} ORDER BY status, position, id"))?;
    let rows = statement
        .query_map([], TaskRow::from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut tags = tags_by_task(connection)?;
    rows.into_iter()
        .map(|row| {
            let task_tags = tags.remove(&row.id).unwrap_or_default();
            row.into_task(task_tags)
        })
        .collect()
}

pub fn find(connection: &Connection, id: i64) -> AppResult<Option<Task>> {
    let row = connection
        .query_row(
            &format!("{SELECT_TASK} WHERE id = ?1"),
            [id],
            TaskRow::from_row,
        )
        .optional()?;
    match row {
        Some(row) => {
            let tags = tags_of(connection, id)?;
            Ok(Some(row.into_task(tags)?))
        }
        None => Ok(None),
    }
}

/// Insere a tarefa no fim da coluna do seu status. Retorna o id.
pub fn insert(connection: &Connection, task: &ValidTask) -> AppResult<i64> {
    let position = next_position(connection, task.status)?;
    connection.execute(
        "INSERT INTO tasks (title, description, status, priority, due_date, position, completed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6,
                 CASE WHEN ?3 = 'done' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END)",
        params![
            task.title,
            task.description,
            task.status.as_str(),
            task.priority.as_str(),
            task.due_date,
            position
        ],
    )?;
    let id = connection.last_insert_rowid();
    replace_tags(connection, id, &task.tags)?;
    Ok(id)
}

/// Substitui todos os campos editáveis. Mudando de status, a tarefa vai para o
/// fim da nova coluna; a data de conclusão é mantida/definida/limpa conforme o status.
pub fn update(connection: &Connection, id: i64, task: &ValidTask) -> AppResult<()> {
    let current_status = status_of(connection, id)?;
    let new_position = if current_status == task.status {
        None
    } else {
        Some(next_position(connection, task.status)?)
    };

    connection.execute(
        "UPDATE tasks
         SET title = ?2, description = ?3, status = ?4, priority = ?5, due_date = ?6,
             position = COALESCE(?7, position),
             completed_at = CASE WHEN ?4 = 'done'
                                 THEN COALESCE(completed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                            END,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        params![
            id,
            task.title,
            task.description,
            task.status.as_str(),
            task.priority.as_str(),
            task.due_date,
            new_position
        ],
    )?;
    replace_tags(connection, id, &task.tags)
}

/// Move a tarefa para `status`, imediatamente antes de `before_id`
/// (ou para o fim da coluna quando `None`).
pub fn move_to(
    connection: &Connection,
    id: i64,
    status: TaskStatus,
    before_id: Option<i64>,
) -> AppResult<()> {
    status_of(connection, id)?;
    if before_id == Some(id) {
        return Ok(());
    }

    let position = position_before(connection, id, status, before_id)?;
    connection.execute(
        "UPDATE tasks
         SET status = ?2, position = ?3,
             completed_at = CASE WHEN ?2 = 'done'
                                 THEN COALESCE(completed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                            END,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        params![id, status.as_str(), position],
    )?;
    Ok(())
}

/// Exclui a tarefa (tags vinculadas saem em cascata). Retorna o título excluído.
pub fn delete(connection: &Connection, id: i64) -> AppResult<String> {
    let title: String = connection
        .query_row("SELECT title FROM tasks WHERE id = ?1", [id], |row| {
            row.get(0)
        })
        .optional()?
        .ok_or(AppError::NotFound(TASK_NOT_FOUND))?;
    connection.execute("DELETE FROM tasks WHERE id = ?1", [id])?;
    Ok(title)
}

/// Tags em uso por alguma tarefa, em ordem alfabética.
pub fn list_tags(connection: &Connection) -> AppResult<Vec<String>> {
    let mut statement = connection.prepare(
        "SELECT DISTINCT t.name FROM tags t
         JOIN task_tags tt ON tt.tag_id = t.id
         ORDER BY t.name",
    )?;
    let tags = statement
        .query_map([], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    Ok(tags)
}

fn status_of(connection: &Connection, id: i64) -> AppResult<TaskStatus> {
    let status: String = connection
        .query_row("SELECT status FROM tasks WHERE id = ?1", [id], |row| {
            row.get(0)
        })
        .optional()?
        .ok_or(AppError::NotFound(TASK_NOT_FOUND))?;
    TaskStatus::parse(&status)
}

fn next_position(connection: &Connection, status: TaskStatus) -> AppResult<f64> {
    let position = connection.query_row(
        "SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE status = ?1",
        [status.as_str()],
        |row| row.get(0),
    )?;
    Ok(position)
}

fn position_before(
    connection: &Connection,
    moving_id: i64,
    status: TaskStatus,
    before_id: Option<i64>,
) -> AppResult<f64> {
    let Some(before_id) = before_id else {
        return next_position(connection, status);
    };

    for attempt in 0..2 {
        let before_position: f64 = connection
            .query_row(
                "SELECT position FROM tasks WHERE id = ?1 AND status = ?2",
                params![before_id, status.as_str()],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| {
                AppError::Validation("a tarefa de referência não está na coluna de destino".into())
            })?;

        let previous: Option<f64> = connection.query_row(
            "SELECT MAX(position) FROM tasks WHERE status = ?1 AND position < ?2 AND id != ?3",
            params![status.as_str(), before_position, moving_id],
            |row| row.get(0),
        )?;

        match previous {
            None => return Ok(before_position - 1.0),
            Some(previous) if before_position - previous >= MIN_POSITION_GAP => {
                return Ok((previous + before_position) / 2.0)
            }
            // Sem espaço entre as posições: renumera a coluna e tenta de novo.
            Some(_) if attempt == 0 => renumber_column(connection, status)?,
            Some(_) => break,
        }
    }
    Err(AppError::Validation(
        "não foi possível reposicionar a tarefa".into(),
    ))
}

/// Reescreve as posições da coluna como 1, 2, 3… mantendo a ordem atual.
fn renumber_column(connection: &Connection, status: TaskStatus) -> AppResult<()> {
    let ids = {
        let mut statement =
            connection.prepare("SELECT id FROM tasks WHERE status = ?1 ORDER BY position, id")?;
        let ids = statement
            .query_map([status.as_str()], |row| row.get::<_, i64>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        ids
    };
    for (index, id) in ids.iter().enumerate() {
        connection.execute(
            "UPDATE tasks SET position = ?2 WHERE id = ?1",
            params![id, (index + 1) as f64],
        )?;
    }
    Ok(())
}

fn replace_tags(connection: &Connection, task_id: i64, tags: &[String]) -> AppResult<()> {
    connection.execute("DELETE FROM task_tags WHERE task_id = ?1", [task_id])?;
    for name in tags {
        connection.execute(
            "INSERT INTO tags (name) VALUES (?1) ON CONFLICT (name) DO NOTHING",
            [name],
        )?;
        connection.execute(
            "INSERT INTO task_tags (task_id, tag_id)
             SELECT ?1, id FROM tags WHERE name = ?2",
            params![task_id, name],
        )?;
    }
    Ok(())
}

fn tags_of(connection: &Connection, task_id: i64) -> AppResult<Vec<String>> {
    let mut statement = connection.prepare(
        "SELECT t.name FROM task_tags tt JOIN tags t ON t.id = tt.tag_id
         WHERE tt.task_id = ?1 ORDER BY t.name",
    )?;
    let tags = statement
        .query_map([task_id], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    Ok(tags)
}

fn tags_by_task(connection: &Connection) -> AppResult<HashMap<i64, Vec<String>>> {
    let mut statement = connection.prepare(
        "SELECT tt.task_id, t.name FROM task_tags tt JOIN tags t ON t.id = tt.tag_id
         ORDER BY t.name",
    )?;
    let mut map: HashMap<i64, Vec<String>> = HashMap::new();
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (task_id, name) = row?;
        map.entry(task_id).or_default().push(name);
    }
    Ok(map)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn valid(title: &str, status: TaskStatus) -> ValidTask {
        ValidTask {
            title: title.into(),
            description: String::new(),
            status,
            priority: TaskPriority::Medium,
            due_date: None,
            tags: Vec::new(),
        }
    }

    fn column(connection: &Connection, status: TaskStatus) -> Vec<String> {
        list(connection)
            .unwrap()
            .into_iter()
            .filter(|task| task.status == status)
            .map(|task| task.title)
            .collect()
    }

    fn with_db(test: impl FnOnce(&Connection) -> AppResult<()>) {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| test(connection)).unwrap();
    }

    #[test]
    fn inserts_and_reads_with_tags() {
        with_db(|connection| {
            let mut task = valid("Pagar conta", TaskStatus::Todo);
            task.tags = vec!["casa".into(), "boletos".into()];
            task.due_date = Some("2026-10-05".into());
            let id = insert(connection, &task)?;

            let stored = find(connection, id)?.unwrap();
            assert_eq!(stored.title, "Pagar conta");
            assert_eq!(stored.tags, vec!["boletos", "casa"]);
            assert_eq!(stored.due_date.as_deref(), Some("2026-10-05"));
            assert!(stored.completed_at.is_none());
            assert_eq!(list_tags(connection)?, vec!["boletos", "casa"]);
            Ok(())
        });
    }

    #[test]
    fn appends_to_the_end_of_each_column() {
        with_db(|connection| {
            insert(connection, &valid("A", TaskStatus::Todo))?;
            insert(connection, &valid("B", TaskStatus::Todo))?;
            insert(connection, &valid("C", TaskStatus::InProgress))?;
            assert_eq!(column(connection, TaskStatus::Todo), vec!["A", "B"]);
            assert_eq!(column(connection, TaskStatus::InProgress), vec!["C"]);
            Ok(())
        });
    }

    #[test]
    fn update_manages_completion_date_and_column() {
        with_db(|connection| {
            let id = insert(connection, &valid("Tarefa", TaskStatus::Todo))?;

            update(connection, id, &valid("Tarefa", TaskStatus::Done))?;
            let done = find(connection, id)?.unwrap();
            assert!(done.completed_at.is_some());

            update(connection, id, &valid("Tarefa reaberta", TaskStatus::Todo))?;
            let reopened = find(connection, id)?.unwrap();
            assert!(reopened.completed_at.is_none());
            assert_eq!(reopened.title, "Tarefa reaberta");

            assert!(matches!(
                update(connection, 999, &valid("x", TaskStatus::Todo)),
                Err(AppError::NotFound(_))
            ));
            Ok(())
        });
    }

    #[test]
    fn moves_before_a_task_or_to_the_end() {
        with_db(|connection| {
            let a = insert(connection, &valid("A", TaskStatus::Todo))?;
            let b = insert(connection, &valid("B", TaskStatus::Todo))?;
            let c = insert(connection, &valid("C", TaskStatus::Todo))?;

            move_to(connection, c, TaskStatus::Todo, Some(a))?;
            assert_eq!(column(connection, TaskStatus::Todo), vec!["C", "A", "B"]);

            move_to(connection, c, TaskStatus::Todo, Some(b))?;
            assert_eq!(column(connection, TaskStatus::Todo), vec!["A", "C", "B"]);

            move_to(connection, a, TaskStatus::Done, None)?;
            assert_eq!(column(connection, TaskStatus::Todo), vec!["C", "B"]);
            assert_eq!(column(connection, TaskStatus::Done), vec!["A"]);
            assert!(find(connection, a)?.unwrap().completed_at.is_some());

            // A referência precisa estar na coluna de destino.
            assert!(matches!(
                move_to(connection, b, TaskStatus::InProgress, Some(c)),
                Err(AppError::Validation(_))
            ));
            Ok(())
        });
    }

    #[test]
    fn renumbers_when_positions_run_out_of_space() {
        with_db(|connection| {
            let a = insert(connection, &valid("A", TaskStatus::Todo))?;
            let b = insert(connection, &valid("B", TaskStatus::Todo))?;
            // Força duas posições praticamente iguais.
            connection.execute("UPDATE tasks SET position = 1.0 WHERE id = ?1", [a])?;
            connection.execute(
                "UPDATE tasks SET position = 1.0000000001 WHERE id = ?1",
                [b],
            )?;
            let c = insert(connection, &valid("C", TaskStatus::Todo))?;

            move_to(connection, c, TaskStatus::Todo, Some(b))?;
            assert_eq!(column(connection, TaskStatus::Todo), vec!["A", "C", "B"]);
            Ok(())
        });
    }

    #[test]
    fn delete_cascades_tags_and_reports_missing_task() {
        with_db(|connection| {
            let mut task = valid("Excluir", TaskStatus::Todo);
            task.tags = vec!["temp".into()];
            let id = insert(connection, &task)?;

            assert_eq!(delete(connection, id)?, "Excluir");
            assert!(find(connection, id)?.is_none());
            assert!(list_tags(connection)?.is_empty());
            let links: i64 =
                connection.query_row("SELECT COUNT(*) FROM task_tags", [], |row| row.get(0))?;
            assert_eq!(links, 0);
            assert!(matches!(delete(connection, id), Err(AppError::NotFound(_))));
            Ok(())
        });
    }
}
