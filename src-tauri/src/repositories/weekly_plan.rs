//! SQL do planejamento semanal (`weekly_plan_blocks`).

use rusqlite::{params, Connection, OptionalExtension};

use crate::domain::routines::Weekdays;
use crate::domain::task_categories::CategoryColor;
use crate::domain::weekly_plan::{PlanBlock, ValidBlock};
use crate::error::{AppError, AppResult};

const BLOCK_NOT_FOUND: &str = "bloco do planejamento não encontrado";

const SELECT: &str = "SELECT id, title, notes, weekdays, start_time, end_time, color
                      FROM weekly_plan_blocks";

type Row = (
    i64,
    String,
    String,
    i64,
    Option<String>,
    Option<String>,
    String,
);

fn read(row: &rusqlite::Row<'_>) -> rusqlite::Result<Row> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
    ))
}

fn to_block(
    (id, title, notes, weekdays, start_time, end_time, color): Row,
) -> AppResult<PlanBlock> {
    Ok(PlanBlock {
        id,
        title,
        notes,
        weekdays: Weekdays::from_mask(weekdays)?.to_list(),
        start_time,
        end_time,
        color: CategoryColor::parse(&color)?,
    })
}

/// Todos os blocos: anotações do dia inteiro primeiro, depois pelo horário.
pub fn list(connection: &Connection) -> AppResult<Vec<PlanBlock>> {
    let mut statement = connection.prepare(&format!(
        "{SELECT} ORDER BY start_time IS NOT NULL, start_time, title COLLATE NOCASE, id"
    ))?;
    let rows = statement.query_map([], read)?;
    rows.map(|row| to_block(row?)).collect()
}

pub fn find(connection: &Connection, id: i64) -> AppResult<PlanBlock> {
    let row = connection
        .query_row(&format!("{SELECT} WHERE id = ?1"), [id], read)
        .optional()?
        .ok_or(AppError::NotFound(BLOCK_NOT_FOUND))?;
    to_block(row)
}

pub fn count(connection: &Connection) -> AppResult<usize> {
    let count: i64 =
        connection.query_row("SELECT COUNT(*) FROM weekly_plan_blocks", [], |row| {
            row.get(0)
        })?;
    Ok(usize::try_from(count).unwrap_or(usize::MAX))
}

fn times(block: &ValidBlock) -> (Option<String>, Option<String>) {
    match block.span {
        Some(span) => (Some(span.start.to_string()), Some(span.end.to_string())),
        None => (None, None),
    }
}

pub fn insert(connection: &Connection, block: &ValidBlock) -> AppResult<i64> {
    let (start, end) = times(block);
    connection.execute(
        "INSERT INTO weekly_plan_blocks (title, notes, weekdays, start_time, end_time, color)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            block.title,
            block.notes,
            block.weekdays.mask(),
            start,
            end,
            block.color.as_str()
        ],
    )?;
    Ok(connection.last_insert_rowid())
}

pub fn update(connection: &Connection, id: i64, block: &ValidBlock) -> AppResult<()> {
    let (start, end) = times(block);
    let changed = connection.execute(
        "UPDATE weekly_plan_blocks
         SET title = ?2, notes = ?3, weekdays = ?4, start_time = ?5, end_time = ?6, color = ?7,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        params![
            id,
            block.title,
            block.notes,
            block.weekdays.mask(),
            start,
            end,
            block.color.as_str()
        ],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(BLOCK_NOT_FOUND));
    }
    Ok(())
}

/// Exclui e devolve o bloco como era (para a auditoria).
pub fn delete(connection: &Connection, id: i64) -> AppResult<PlanBlock> {
    let block = find(connection, id)?;
    connection.execute("DELETE FROM weekly_plan_blocks WHERE id = ?1", [id])?;
    Ok(block)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::domain::weekly_plan::PlanBlockInput;

    fn block(title: &str, days: &[u8], span: Option<(&str, &str)>) -> ValidBlock {
        PlanBlockInput {
            title: title.into(),
            notes: "obs".into(),
            weekdays: days.to_vec(),
            start_time: span.map(|(start, _)| start.into()),
            end_time: span.map(|(_, end)| end.into()),
            color: CategoryColor::Teal,
        }
        .validate()
        .unwrap()
    }

    #[test]
    fn stores_lists_updates_and_deletes_blocks() {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| {
            let work = insert(
                connection,
                &block("Trabalho", &[1, 3, 5], Some(("08:00", "15:00"))),
            )?;
            insert(connection, &block("Descanso", &[0], None))?;
            insert(
                connection,
                &block("Acordar", &[2], Some(("06:00", "06:30"))),
            )?;

            let titles: Vec<String> = list(connection)?.into_iter().map(|b| b.title).collect();
            assert_eq!(titles, ["Descanso", "Acordar", "Trabalho"]);
            assert_eq!(count(connection)?, 3);

            let stored = find(connection, work)?;
            assert_eq!(stored.weekdays, [1, 3, 5]);
            assert_eq!(stored.start_time.as_deref(), Some("08:00"));
            assert_eq!(stored.notes, "obs");
            assert_eq!(stored.color, CategoryColor::Teal);

            update(
                connection,
                work,
                &block("Trabalho presencial", &[2, 4], None),
            )?;
            let changed = find(connection, work)?;
            assert_eq!(changed.title, "Trabalho presencial");
            assert_eq!(changed.start_time, None);
            assert_eq!(changed.weekdays, [2, 4]);

            assert_eq!(delete(connection, work)?.title, "Trabalho presencial");
            assert!(matches!(find(connection, work), Err(AppError::NotFound(_))));
            assert!(matches!(
                update(connection, work, &block("x", &[1], None)),
                Err(AppError::NotFound(_))
            ));
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn the_table_rejects_invalid_rows() {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| {
            let insert_raw = |start: Option<&str>, end: Option<&str>, weekdays: i64| {
                connection.execute(
                    "INSERT INTO weekly_plan_blocks (title, weekdays, start_time, end_time, color)
                     VALUES ('x', ?1, ?2, ?3, 'blue')",
                    params![weekdays, start, end],
                )
            };
            assert!(insert_raw(Some("08:00"), Some("09:00"), 2).is_ok());
            assert!(insert_raw(None, None, 127).is_ok());
            assert!(insert_raw(Some("09:00"), Some("08:00"), 2).is_err());
            assert!(insert_raw(Some("08:00"), None, 2).is_err());
            assert!(insert_raw(Some("8:00"), Some("09:00"), 2).is_err());
            assert!(insert_raw(None, None, 0).is_err());
            Ok(())
        })
        .unwrap();
    }
}
