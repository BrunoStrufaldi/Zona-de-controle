//! Acesso às tabelas `routines`, `habits` e `habit_completions`.

use rusqlite::{params, Connection, OptionalExtension};

use crate::domain::calendar::CalendarDate;
use crate::domain::routines::{Completions, HabitSpan, Weekdays};
use crate::error::{AppError, AppResult};

pub const ROUTINE_NOT_FOUND: &str = "rotina não encontrada";
const HABIT_NOT_FOUND: &str = "hábito não encontrado";

/// Linha de `routines` já convertida.
#[derive(Debug, Clone, PartialEq)]
pub struct RoutineRow {
    pub id: i64,
    pub name: String,
    pub weekdays: Weekdays,
    pub start_date: CalendarDate,
}

/// Hábito com seu período de validade e posição.
#[derive(Debug, Clone, PartialEq)]
pub struct HabitRow {
    pub span: HabitSpan,
    pub name: String,
    pub position: i64,
}

fn parse_date(value: &str) -> AppResult<CalendarDate> {
    CalendarDate::parse(value)
        .ok_or_else(|| AppError::Validation(format!("data inválida no banco: {value}")))
}

/// Rotinas na ordem de criação.
pub fn list(connection: &Connection) -> AppResult<Vec<RoutineRow>> {
    let mut statement =
        connection.prepare("SELECT id, name, weekdays, start_date FROM routines ORDER BY id")?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    rows.into_iter()
        .map(|(id, name, weekdays, start_date)| {
            Ok(RoutineRow {
                id,
                name,
                weekdays: Weekdays::from_mask(weekdays)?,
                start_date: parse_date(&start_date)?,
            })
        })
        .collect()
}

pub fn find(connection: &Connection, id: i64) -> AppResult<RoutineRow> {
    list(connection)?
        .into_iter()
        .find(|routine| routine.id == id)
        .ok_or(AppError::NotFound(ROUTINE_NOT_FOUND))
}

pub fn count(connection: &Connection) -> AppResult<usize> {
    let count: i64 = connection.query_row("SELECT COUNT(*) FROM routines", [], |row| row.get(0))?;
    Ok(count as usize)
}

pub fn insert(
    connection: &Connection,
    name: &str,
    weekdays: Weekdays,
    start_date: CalendarDate,
) -> AppResult<i64> {
    ensure_unique_name(connection, name, None)?;
    connection.execute(
        "INSERT INTO routines (name, weekdays, start_date) VALUES (?1, ?2, ?3)",
        params![name, weekdays.mask(), start_date.to_string()],
    )?;
    Ok(connection.last_insert_rowid())
}

pub fn update(connection: &Connection, id: i64, name: &str, weekdays: Weekdays) -> AppResult<()> {
    ensure_unique_name(connection, name, Some(id))?;
    let changed = connection.execute(
        "UPDATE routines
         SET name = ?2, weekdays = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        params![id, name, weekdays.mask()],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(ROUTINE_NOT_FOUND));
    }
    Ok(())
}

/// Exclui a rotina (hábitos e marcações saem em cascata). Retorna nome e nº de hábitos atuais.
pub fn delete(connection: &Connection, id: i64) -> AppResult<(String, usize)> {
    let routine = find(connection, id)?;
    let habits = habits_of(connection, id)?
        .iter()
        .filter(|habit| habit.span.removed_on.is_none())
        .count();
    connection.execute("DELETE FROM routines WHERE id = ?1", [id])?;
    Ok((routine.name, habits))
}

// ---- Hábitos -----------------------------------------------------------------

/// Todos os hábitos da rotina (inclusive removidos), na ordem de exibição.
pub fn habits_of(connection: &Connection, routine_id: i64) -> AppResult<Vec<HabitRow>> {
    let mut statement = connection.prepare(
        "SELECT id, name, position, created_on, removed_on FROM habits
         WHERE routine_id = ?1 ORDER BY position, id",
    )?;
    let rows = statement
        .query_map([routine_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    rows.into_iter()
        .map(|(id, name, position, created_on, removed_on)| {
            Ok(HabitRow {
                span: HabitSpan {
                    id,
                    created_on: parse_date(&created_on)?,
                    removed_on: removed_on.as_deref().map(parse_date).transpose()?,
                },
                name,
                position,
            })
        })
        .collect()
}

/// Rotina dona do hábito.
pub fn routine_of_habit(connection: &Connection, habit_id: i64) -> AppResult<i64> {
    connection
        .query_row(
            "SELECT routine_id FROM habits WHERE id = ?1",
            [habit_id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or(AppError::NotFound(HABIT_NOT_FOUND))
}

pub fn insert_habit(
    connection: &Connection,
    routine_id: i64,
    name: &str,
    position: i64,
    created_on: CalendarDate,
) -> AppResult<i64> {
    connection.execute(
        "INSERT INTO habits (routine_id, name, position, created_on) VALUES (?1, ?2, ?3, ?4)",
        params![routine_id, name, position, created_on.to_string()],
    )?;
    Ok(connection.last_insert_rowid())
}

pub fn update_habit(connection: &Connection, id: i64, name: &str, position: i64) -> AppResult<()> {
    connection.execute(
        "UPDATE habits SET name = ?2, position = ?3 WHERE id = ?1",
        params![id, name, position],
    )?;
    Ok(())
}

/// O hábito deixa de valer a partir de `removed_on`; os dias anteriores não mudam.
pub fn remove_habit(connection: &Connection, id: i64, removed_on: CalendarDate) -> AppResult<()> {
    connection.execute(
        "UPDATE habits SET removed_on = ?2 WHERE id = ?1 AND removed_on IS NULL",
        params![id, removed_on.to_string()],
    )?;
    Ok(())
}

// ---- Marcações ---------------------------------------------------------------

/// Hábitos feitos por dia, para todos os hábitos da rotina.
pub fn completions_of(connection: &Connection, routine_id: i64) -> AppResult<Completions> {
    let mut statement = connection.prepare(
        "SELECT hc.habit_id, hc.date FROM habit_completions hc
         JOIN habits h ON h.id = hc.habit_id
         WHERE h.routine_id = ?1",
    )?;
    let rows = statement
        .query_map([routine_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut completions = Completions::new();
    for (habit_id, date) in rows {
        completions
            .entry(parse_date(&date)?)
            .or_default()
            .insert(habit_id);
    }
    Ok(completions)
}

pub fn set_completion(
    connection: &Connection,
    habit_id: i64,
    date: CalendarDate,
    done: bool,
) -> AppResult<()> {
    if done {
        connection.execute(
            "INSERT INTO habit_completions (habit_id, date) VALUES (?1, ?2)
             ON CONFLICT (habit_id, date) DO NOTHING",
            params![habit_id, date.to_string()],
        )?;
    } else {
        connection.execute(
            "DELETE FROM habit_completions WHERE habit_id = ?1 AND date = ?2",
            params![habit_id, date.to_string()],
        )?;
    }
    Ok(())
}

/// Nomes únicos sem diferenciar maiúsculas (inclusive acentuadas).
fn ensure_unique_name(
    connection: &Connection,
    name: &str,
    except_id: Option<i64>,
) -> AppResult<()> {
    let wanted = name.to_lowercase();
    let clash = list(connection)?
        .into_iter()
        .any(|routine| Some(routine.id) != except_id && routine.name.to_lowercase() == wanted);
    if clash {
        return Err(AppError::Validation(format!(
            "já existe uma rotina chamada “{name}”"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn date(value: &str) -> CalendarDate {
        CalendarDate::parse(value).unwrap()
    }

    fn with_db(test: impl FnOnce(&Connection) -> AppResult<()>) {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| test(connection)).unwrap();
    }

    #[test]
    fn stores_routines_habits_and_completions() {
        with_db(|connection| {
            let days = Weekdays::from_list(&[1, 3]).unwrap();
            let id = insert(connection, "Academia", days, date("2026-09-21"))?;
            assert!(matches!(
                insert(connection, "academia", days, date("2026-09-21")),
                Err(AppError::Validation(_))
            ));

            let water = insert_habit(connection, id, "Beber água", 0, date("2026-09-21"))?;
            let stretch = insert_habit(connection, id, "Alongar", 1, date("2026-09-21"))?;
            // Reordena: "Alongar" passa para o topo.
            update_habit(connection, stretch, "Alongar 10 min", 0)?;
            update_habit(connection, water, "Beber água", 1)?;
            remove_habit(connection, water, date("2026-09-23"))?;

            let habits = habits_of(connection, id)?;
            assert_eq!(habits[0].name, "Alongar 10 min");
            assert_eq!(habits[1].span.removed_on, Some(date("2026-09-23")));
            assert_eq!(routine_of_habit(connection, water)?, id);

            set_completion(connection, stretch, date("2026-09-21"), true)?;
            set_completion(connection, stretch, date("2026-09-21"), true)?;
            set_completion(connection, water, date("2026-09-21"), true)?;
            set_completion(connection, water, date("2026-09-21"), false)?;
            let completions = completions_of(connection, id)?;
            assert_eq!(completions[&date("2026-09-21")].len(), 1);

            let row = find(connection, id)?;
            assert_eq!(row.weekdays, days);
            assert_eq!(row.start_date, date("2026-09-21"));
            Ok(())
        });
    }

    #[test]
    fn delete_cascades_habits_and_completions() {
        with_db(|connection| {
            let id = insert(connection, "Noite", Weekdays::ALL, date("2026-09-25"))?;
            let habit = insert_habit(connection, id, "Ler", 0, date("2026-09-25"))?;
            set_completion(connection, habit, date("2026-09-25"), true)?;

            assert_eq!(delete(connection, id)?, ("Noite".to_string(), 1));
            let left: i64 = connection.query_row(
                "SELECT (SELECT COUNT(*) FROM habits) + (SELECT COUNT(*) FROM habit_completions)",
                [],
                |row| row.get(0),
            )?;
            assert_eq!(left, 0);
            assert!(matches!(find(connection, id), Err(AppError::NotFound(_))));
            Ok(())
        });
    }
}
