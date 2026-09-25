//! Acesso às tabelas `tasks`, `tags`, `task_tags` e `task_checklist_items`.

use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::domain::task_recurrence::Recurrence;
use crate::domain::tasks::{
    ChecklistItem, ChecklistItemInput, Task, TaskPriority, TaskStatus, ValidTask,
};
use crate::error::{AppError, AppResult};

const TASK_NOT_FOUND: &str = "tarefa não encontrada";
const ITEM_NOT_FOUND: &str = "item da checklist não encontrado";

/// Menor distância entre posições antes de renumerar a coluna.
const MIN_POSITION_GAP: f64 = 1e-6;

const SELECT_TASK: &str = "SELECT id, title, description, status, priority, due_date,
       position, category_id, recurrence, completed_at, archived_at, created_at, updated_at
FROM tasks";

/// Linha crua do banco; status, prioridade e recorrência são convertidos fora
/// do mapeamento para reportar valores inválidos como `AppError`.
struct TaskRow {
    id: i64,
    title: String,
    description: String,
    status: String,
    priority: String,
    due_date: Option<String>,
    position: f64,
    category_id: Option<i64>,
    recurrence: Option<String>,
    completed_at: Option<String>,
    archived_at: Option<String>,
    created_at: String,
    updated_at: String,
}

/// Tags e itens de checklist de uma tarefa, carregados à parte.
#[derive(Default)]
struct TaskChildren {
    tags: Vec<String>,
    checklist: Vec<ChecklistItem>,
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
            category_id: row.get(7)?,
            recurrence: row.get(8)?,
            completed_at: row.get(9)?,
            archived_at: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    }

    fn into_task(self, children: TaskChildren) -> AppResult<Task> {
        Ok(Task {
            id: self.id,
            title: self.title,
            description: self.description,
            status: TaskStatus::parse(&self.status)?,
            priority: TaskPriority::parse(&self.priority)?,
            due_date: self.due_date,
            position: self.position,
            tags: children.tags,
            category_id: self.category_id,
            recurrence: self
                .recurrence
                .as_deref()
                .map(serde_json::from_str::<Recurrence>)
                .transpose()?,
            checklist: children.checklist,
            completed_at: self.completed_at,
            archived_at: self.archived_at,
            created_at: self.created_at,
            updated_at: self.updated_at,
        })
    }
}

/// Tarefas ativas (não arquivadas), agrupadas por status e ordenadas pela posição.
pub fn list(connection: &Connection) -> AppResult<Vec<Task>> {
    query_tasks(
        connection,
        "WHERE archived_at IS NULL ORDER BY status, position, id",
    )
}

/// Tarefas arquivadas, das arquivadas mais recentemente para as mais antigas.
pub fn list_archived(connection: &Connection) -> AppResult<Vec<Task>> {
    query_tasks(
        connection,
        "WHERE archived_at IS NOT NULL ORDER BY archived_at DESC, id DESC",
    )
}

fn query_tasks(connection: &Connection, filter_and_order: &str) -> AppResult<Vec<Task>> {
    let mut statement = connection.prepare(&format!("{SELECT_TASK} {filter_and_order}"))?;
    let rows = statement
        .query_map([], TaskRow::from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut children = children_by_task(connection)?;
    rows.into_iter()
        .map(|row| {
            let task_children = children.remove(&row.id).unwrap_or_default();
            row.into_task(task_children)
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
            let children = TaskChildren {
                tags: tags_of(connection, id)?,
                checklist: checklist_of(connection, id)?,
            };
            Ok(Some(row.into_task(children)?))
        }
        None => Ok(None),
    }
}

/// Data local de hoje (`aaaa-mm-dd`), segundo o fuso do sistema operacional.
pub fn local_today(connection: &Connection) -> AppResult<String> {
    let today = connection.query_row("SELECT date('now', 'localtime')", [], |row| row.get(0))?;
    Ok(today)
}

/// Insere a tarefa no fim da coluna do seu status. Retorna o id.
pub fn insert(connection: &Connection, task: &ValidTask) -> AppResult<i64> {
    ensure_category_exists(connection, task.category_id)?;
    let position = next_position(connection, task.status)?;
    connection.execute(
        "INSERT INTO tasks (title, description, status, priority, due_date, position,
                            category_id, recurrence, completed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
                 CASE WHEN ?3 = 'done' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END)",
        params![
            task.title,
            task.description,
            task.status.as_str(),
            task.priority.as_str(),
            task.due_date,
            position,
            task.category_id,
            recurrence_json(task)?
        ],
    )?;
    let id = connection.last_insert_rowid();
    replace_tags(connection, id, &task.tags)?;
    replace_checklist(connection, id, &task.checklist)?;
    Ok(id)
}

/// Substitui todos os campos editáveis. Mudando de status, a tarefa vai para o
/// fim da nova coluna; a data de conclusão é mantida/definida/limpa conforme o status.
/// Tarefas arquivadas precisam ser restauradas antes.
pub fn update(connection: &Connection, id: i64, task: &ValidTask) -> AppResult<()> {
    let current_status = active_status_of(connection, id)?;
    ensure_category_exists(connection, task.category_id)?;
    let new_position = if current_status == task.status {
        None
    } else {
        Some(next_position(connection, task.status)?)
    };

    connection.execute(
        "UPDATE tasks
         SET title = ?2, description = ?3, status = ?4, priority = ?5, due_date = ?6,
             position = COALESCE(?7, position), category_id = ?8, recurrence = ?9,
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
            new_position,
            task.category_id,
            recurrence_json(task)?
        ],
    )?;
    replace_tags(connection, id, &task.tags)?;
    replace_checklist(connection, id, &task.checklist)
}

/// Move a tarefa para `status`, imediatamente antes de `before_id`
/// (ou para o fim da coluna quando `None`).
pub fn move_to(
    connection: &Connection,
    id: i64,
    status: TaskStatus,
    before_id: Option<i64>,
) -> AppResult<()> {
    active_status_of(connection, id)?;
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

/// Arquiva a tarefa (idempotente).
pub fn archive(connection: &Connection, id: i64) -> AppResult<()> {
    status_of(connection, id)?;
    connection.execute(
        "UPDATE tasks
         SET archived_at = COALESCE(archived_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        [id],
    )?;
    Ok(())
}

/// Arquiva todas as tarefas concluídas ainda ativas. Retorna quantas foram arquivadas.
pub fn archive_done(connection: &Connection) -> AppResult<usize> {
    let count = connection.execute(
        "UPDATE tasks
         SET archived_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE status = 'done' AND archived_at IS NULL",
        [],
    )?;
    Ok(count)
}

/// Restaura uma tarefa arquivada para o fim da coluna do seu status (idempotente).
pub fn restore(connection: &Connection, id: i64) -> AppResult<()> {
    let status = status_of(connection, id)?;
    let position = next_position(connection, status)?;
    connection.execute(
        "UPDATE tasks
         SET archived_at = NULL, position = ?2,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1 AND archived_at IS NOT NULL",
        params![id, position],
    )?;
    Ok(())
}

/// Remove a regra de recorrência (usada quando ela passa para a próxima ocorrência).
pub fn clear_recurrence(connection: &Connection, id: i64) -> AppResult<()> {
    connection.execute("UPDATE tasks SET recurrence = NULL WHERE id = ?1", [id])?;
    Ok(())
}

/// Marca/desmarca um item da checklist. Retorna o id da tarefa dona do item.
pub fn set_checklist_item_done(
    connection: &Connection,
    item_id: i64,
    done: bool,
) -> AppResult<i64> {
    let task_id: i64 = connection
        .query_row(
            "SELECT task_id FROM task_checklist_items WHERE id = ?1",
            [item_id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or(AppError::NotFound(ITEM_NOT_FOUND))?;
    active_status_of(connection, task_id)?;
    connection.execute(
        "UPDATE task_checklist_items SET done = ?2 WHERE id = ?1",
        params![item_id, done],
    )?;
    connection.execute(
        "UPDATE tasks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
        [task_id],
    )?;
    Ok(task_id)
}

/// Exclui a tarefa (tags vinculadas e checklist saem em cascata). Retorna o título excluído.
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

/// Status de uma tarefa que pode ser alterada (existe e não está arquivada).
fn active_status_of(connection: &Connection, id: i64) -> AppResult<TaskStatus> {
    let (status, archived): (String, bool) = connection
        .query_row(
            "SELECT status, archived_at IS NOT NULL FROM tasks WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
        .ok_or(AppError::NotFound(TASK_NOT_FOUND))?;
    if archived {
        return Err(AppError::Validation(
            "a tarefa está arquivada; restaure-a para alterá-la".into(),
        ));
    }
    TaskStatus::parse(&status)
}

fn ensure_category_exists(connection: &Connection, category_id: Option<i64>) -> AppResult<()> {
    let Some(category_id) = category_id else {
        return Ok(());
    };
    let exists: bool = connection.query_row(
        "SELECT EXISTS (SELECT 1 FROM task_categories WHERE id = ?1)",
        [category_id],
        |row| row.get(0),
    )?;
    if exists {
        Ok(())
    } else {
        Err(AppError::Validation("categoria não encontrada".into()))
    }
}

fn recurrence_json(task: &ValidTask) -> AppResult<Option<String>> {
    Ok(task
        .recurrence
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?)
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

fn replace_checklist(
    connection: &Connection,
    task_id: i64,
    items: &[ChecklistItemInput],
) -> AppResult<()> {
    connection.execute(
        "DELETE FROM task_checklist_items WHERE task_id = ?1",
        [task_id],
    )?;
    for (index, item) in items.iter().enumerate() {
        connection.execute(
            "INSERT INTO task_checklist_items (task_id, text, done, position)
             VALUES (?1, ?2, ?3, ?4)",
            params![task_id, item.text, item.done, index as i64],
        )?;
    }
    Ok(())
}

fn checklist_of(connection: &Connection, task_id: i64) -> AppResult<Vec<ChecklistItem>> {
    let mut statement = connection.prepare(
        "SELECT id, text, done FROM task_checklist_items
         WHERE task_id = ?1 ORDER BY position, id",
    )?;
    let items = statement
        .query_map([task_id], |row| {
            Ok(ChecklistItem {
                id: row.get(0)?,
                text: row.get(1)?,
                done: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
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

fn children_by_task(connection: &Connection) -> AppResult<HashMap<i64, TaskChildren>> {
    let mut map: HashMap<i64, TaskChildren> = HashMap::new();

    let mut tags = connection.prepare(
        "SELECT tt.task_id, t.name FROM task_tags tt JOIN tags t ON t.id = tt.tag_id
         ORDER BY t.name",
    )?;
    let rows = tags.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (task_id, name) = row?;
        map.entry(task_id).or_default().tags.push(name);
    }

    let mut items = connection.prepare(
        "SELECT task_id, id, text, done FROM task_checklist_items ORDER BY task_id, position, id",
    )?;
    let rows = items.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            ChecklistItem {
                id: row.get(1)?,
                text: row.get(2)?,
                done: row.get(3)?,
            },
        ))
    })?;
    for row in rows {
        let (task_id, item) = row?;
        map.entry(task_id).or_default().checklist.push(item);
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
            category_id: None,
            recurrence: None,
            checklist: Vec::new(),
        }
    }

    fn item(text: &str, done: bool) -> ChecklistItemInput {
        ChecklistItemInput {
            text: text.into(),
            done,
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

    #[test]
    fn stores_checklist_in_order_and_toggles_items() {
        with_db(|connection| {
            let mut task = valid("Pintar a sala", TaskStatus::Todo);
            task.checklist = vec![item("Comprar tinta", true), item("Cobrir móveis", false)];
            let id = insert(connection, &task)?;

            let stored = find(connection, id)?.unwrap();
            let texts: Vec<_> = stored.checklist.iter().map(|i| i.text.as_str()).collect();
            assert_eq!(texts, vec!["Comprar tinta", "Cobrir móveis"]);
            assert!(stored.checklist[0].done && !stored.checklist[1].done);

            let second = stored.checklist[1].id;
            assert_eq!(set_checklist_item_done(connection, second, true)?, id);
            assert!(list(connection)?[0].checklist[1].done);
            assert!(matches!(
                set_checklist_item_done(connection, 999, true),
                Err(AppError::NotFound(_))
            ));

            // Salvar o formulário substitui a checklist inteira.
            task.checklist = vec![item("Só este", false)];
            update(connection, id, &task)?;
            assert_eq!(find(connection, id)?.unwrap().checklist.len(), 1);

            delete(connection, id)?;
            let orphans: i64 =
                connection.query_row("SELECT COUNT(*) FROM task_checklist_items", [], |row| {
                    row.get(0)
                })?;
            assert_eq!(orphans, 0);
            Ok(())
        });
    }

    #[test]
    fn stores_recurrence_and_category() {
        use crate::domain::task_recurrence::RecurrenceFrequency;

        with_db(|connection| {
            connection.execute(
                "INSERT INTO task_categories (name, color) VALUES ('Casa', 'green')",
                [],
            )?;
            let category_id = connection.last_insert_rowid();

            let mut task = valid("Regar plantas", TaskStatus::Todo);
            task.due_date = Some("2026-09-25".into());
            task.category_id = Some(category_id);
            task.recurrence = Some(Recurrence {
                frequency: RecurrenceFrequency::Weekly,
                interval: 1,
                weekdays: vec![1, 4],
            });
            let id = insert(connection, &task)?;

            let stored = find(connection, id)?.unwrap();
            assert_eq!(stored.category_id, Some(category_id));
            assert_eq!(stored.recurrence, task.recurrence);

            clear_recurrence(connection, id)?;
            assert!(find(connection, id)?.unwrap().recurrence.is_none());

            // Excluir a categoria deixa a tarefa sem categoria.
            connection.execute("DELETE FROM task_categories WHERE id = ?1", [category_id])?;
            assert_eq!(find(connection, id)?.unwrap().category_id, None);

            assert!(matches!(
                insert(connection, &task),
                Err(AppError::Validation(_))
            ));
            Ok(())
        });
    }

    #[test]
    fn archives_restores_and_blocks_changes_while_archived() {
        with_db(|connection| {
            let open = insert(connection, &valid("Aberta", TaskStatus::Todo))?;
            let done = insert(connection, &valid("Feita", TaskStatus::Done))?;
            insert(connection, &valid("Outra feita", TaskStatus::Done))?;

            archive(connection, open)?;
            assert_eq!(list(connection)?.len(), 2);
            assert_eq!(list_archived(connection)?[0].title, "Aberta");
            assert!(matches!(
                move_to(connection, open, TaskStatus::Done, None),
                Err(AppError::Validation(_))
            ));
            assert!(matches!(
                update(connection, open, &valid("x", TaskStatus::Todo)),
                Err(AppError::Validation(_))
            ));

            assert_eq!(archive_done(connection)?, 2);
            assert!(list(connection)?.is_empty());
            assert_eq!(archive_done(connection)?, 0);

            restore(connection, done)?;
            let restored = find(connection, done)?.unwrap();
            assert!(restored.archived_at.is_none());
            assert_eq!(restored.status, TaskStatus::Done);
            assert_eq!(column(connection, TaskStatus::Done), vec!["Feita"]);

            assert!(matches!(
                archive(connection, 999),
                Err(AppError::NotFound(_))
            ));
            Ok(())
        });
    }

    #[test]
    fn reads_the_local_date() {
        with_db(|connection| {
            let today = local_today(connection)?;
            assert!(crate::domain::tasks::is_valid_iso_date(&today), "{today}");
            Ok(())
        });
    }
}
