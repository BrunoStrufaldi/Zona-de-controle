//! Acesso às tabelas `calendar_events`, `calendar_event_exceptions` e
//! `calendar_reminders_sent`.

use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::domain::calendar::{CalendarDate, LocalDateTime, TimeOfDay};
use crate::domain::calendar_events::{EventDetails, EventRecurrence, Series, ValidEvent};
use crate::domain::task_categories::CategoryColor;
use crate::error::{AppError, AppResult};

pub const EVENT_NOT_FOUND: &str = "evento não encontrado";
/// Registros de lembretes enviados são descartados depois deste prazo.
const SENT_REMINDERS_RETENTION_DAYS: i64 = 60;

const SELECT_EVENT: &str = "SELECT id, color, title, description, location, all_day, start_date,
       start_time, end_date, end_time, reminder_minutes, recurrence, created_at, updated_at
FROM calendar_events";

fn invalid(what: &str, value: &str) -> AppError {
    AppError::Validation(format!("{what} inválido no banco: {value}"))
}

fn parse_date(value: &str) -> AppResult<CalendarDate> {
    CalendarDate::parse(value).ok_or_else(|| invalid("data", value))
}

fn parse_time(value: Option<String>) -> AppResult<Option<TimeOfDay>> {
    value
        .map(|value| TimeOfDay::parse(&value).ok_or_else(|| invalid("horário", &value)))
        .transpose()
}

/// Colunas de detalhes na ordem: title, description, location, all_day,
/// start_date, start_time, end_date, end_time, reminder_minutes.
type RawDetails = (
    String,
    String,
    String,
    bool,
    String,
    Option<String>,
    String,
    Option<String>,
    Option<u32>,
);

fn read_details(row: &Row<'_>, first: usize) -> rusqlite::Result<RawDetails> {
    Ok((
        row.get(first)?,
        row.get(first + 1)?,
        row.get(first + 2)?,
        row.get(first + 3)?,
        row.get(first + 4)?,
        row.get(first + 5)?,
        row.get(first + 6)?,
        row.get(first + 7)?,
        row.get(first + 8)?,
    ))
}

fn to_details(raw: RawDetails) -> AppResult<EventDetails> {
    let (title, description, location, all_day, start, start_time, end, end_time, reminder) = raw;
    Ok(EventDetails {
        title,
        description,
        location,
        all_day,
        start_date: parse_date(&start)?,
        start_time: parse_time(start_time)?,
        end_date: parse_date(&end)?,
        end_time: parse_time(end_time)?,
        reminder_minutes: reminder,
    })
}

struct RawEvent {
    id: i64,
    color: String,
    details: RawDetails,
    recurrence: Option<String>,
    created_at: String,
    updated_at: String,
}

fn read_event(row: &Row<'_>) -> rusqlite::Result<RawEvent> {
    Ok(RawEvent {
        id: row.get(0)?,
        color: row.get(1)?,
        details: read_details(row, 2)?,
        recurrence: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

type Exceptions = HashMap<CalendarDate, Option<EventDetails>>;

fn to_series(raw: RawEvent, exceptions: Exceptions) -> AppResult<Series> {
    Ok(Series {
        id: raw.id,
        color: CategoryColor::parse(&raw.color)?,
        details: to_details(raw.details)?,
        recurrence: raw
            .recurrence
            .as_deref()
            .map(serde_json::from_str::<EventRecurrence>)
            .transpose()?,
        exceptions,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
    })
}

/// Todas as séries com suas exceções, na ordem de criação.
pub fn list(connection: &Connection) -> AppResult<Vec<Series>> {
    let mut statement = connection.prepare(&format!("{SELECT_EVENT} ORDER BY id"))?;
    let events = statement
        .query_map([], read_event)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut exceptions = exceptions_by_event(connection, None)?;
    events
        .into_iter()
        .map(|event| {
            let own = exceptions.remove(&event.id).unwrap_or_default();
            to_series(event, own)
        })
        .collect()
}

pub fn find(connection: &Connection, id: i64) -> AppResult<Series> {
    let event = connection
        .query_row(&format!("{SELECT_EVENT} WHERE id = ?1"), [id], read_event)
        .optional()?
        .ok_or(AppError::NotFound(EVENT_NOT_FOUND))?;
    let exceptions = exceptions_by_event(connection, Some(id))?
        .remove(&id)
        .unwrap_or_default();
    to_series(event, exceptions)
}

fn exceptions_by_event(
    connection: &Connection,
    event_id: Option<i64>,
) -> AppResult<HashMap<i64, Exceptions>> {
    let mut statement = connection.prepare(
        "SELECT event_id, occurrence_date, cancelled, title, description, location, all_day,
                start_date, start_time, end_date, end_time, reminder_minutes
         FROM calendar_event_exceptions
         WHERE ?1 IS NULL OR event_id = ?1",
    )?;
    let rows = statement
        .query_map([event_id], |row| {
            let cancelled: bool = row.get(2)?;
            let details = if cancelled {
                None
            } else {
                Some(read_details(row, 3)?)
            };
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, details))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut grouped: HashMap<i64, Exceptions> = HashMap::new();
    for (event_id, date, details) in rows {
        grouped
            .entry(event_id)
            .or_default()
            .insert(parse_date(&date)?, details.map(to_details).transpose()?);
    }
    Ok(grouped)
}

fn recurrence_json(event: &ValidEvent) -> AppResult<Option<String>> {
    Ok(event
        .recurrence
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?)
}

pub fn insert(connection: &Connection, event: &ValidEvent) -> AppResult<i64> {
    let details = &event.details;
    connection.execute(
        "INSERT INTO calendar_events (color, title, description, location, all_day, start_date,
                                      start_time, end_date, end_time, reminder_minutes, recurrence)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            event.color.as_str(),
            details.title,
            details.description,
            details.location,
            details.all_day,
            details.start_date.to_string(),
            details.start_time.map(|time| time.to_string()),
            details.end_date.to_string(),
            details.end_time.map(|time| time.to_string()),
            details.reminder_minutes,
            recurrence_json(event)?,
        ],
    )?;
    Ok(connection.last_insert_rowid())
}

pub fn update(connection: &Connection, id: i64, event: &ValidEvent) -> AppResult<()> {
    let details = &event.details;
    let changed = connection.execute(
        "UPDATE calendar_events
         SET color = ?2, title = ?3, description = ?4, location = ?5, all_day = ?6,
             start_date = ?7, start_time = ?8, end_date = ?9, end_time = ?10,
             reminder_minutes = ?11, recurrence = ?12,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        params![
            id,
            event.color.as_str(),
            details.title,
            details.description,
            details.location,
            details.all_day,
            details.start_date.to_string(),
            details.start_time.map(|time| time.to_string()),
            details.end_date.to_string(),
            details.end_time.map(|time| time.to_string()),
            details.reminder_minutes,
            recurrence_json(event)?,
        ],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(EVENT_NOT_FOUND));
    }
    Ok(())
}

/// Exclui a série (exceções e lembretes enviados saem em cascata). Retorna o título.
pub fn delete(connection: &Connection, id: i64) -> AppResult<String> {
    let title: String = connection
        .query_row(
            "SELECT title FROM calendar_events WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or(AppError::NotFound(EVENT_NOT_FOUND))?;
    connection.execute("DELETE FROM calendar_events WHERE id = ?1", [id])?;
    Ok(title)
}

/// Grava a exceção de uma ocorrência: `None` cancela; `Some` substitui os dados.
pub fn upsert_exception(
    connection: &Connection,
    event_id: i64,
    occurrence_date: CalendarDate,
    details: Option<&EventDetails>,
) -> AppResult<()> {
    connection.execute(
        "INSERT OR REPLACE INTO calendar_event_exceptions
             (event_id, occurrence_date, cancelled, title, description, location, all_day,
              start_date, start_time, end_date, end_time, reminder_minutes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            event_id,
            occurrence_date.to_string(),
            details.is_none(),
            details.map(|d| d.title.as_str()),
            details.map(|d| d.description.as_str()),
            details.map(|d| d.location.as_str()),
            details.map(|d| d.all_day),
            details.map(|d| d.start_date.to_string()),
            details
                .and_then(|d| d.start_time)
                .map(|time| time.to_string()),
            details.map(|d| d.end_date.to_string()),
            details
                .and_then(|d| d.end_time)
                .map(|time| time.to_string()),
            details.and_then(|d| d.reminder_minutes),
        ],
    )?;
    Ok(())
}

/// Remove todas as exceções da série. Retorna quantas havia.
pub fn delete_exceptions(connection: &Connection, event_id: i64) -> AppResult<usize> {
    Ok(connection.execute(
        "DELETE FROM calendar_event_exceptions WHERE event_id = ?1",
        [event_id],
    )?)
}

/// Registra o lembrete como enviado. `false` se já estava registrado.
pub fn mark_reminder_sent(
    connection: &Connection,
    event_id: i64,
    occurrence_date: &str,
    remind_at: &str,
) -> AppResult<bool> {
    let inserted = connection.execute(
        "INSERT OR IGNORE INTO calendar_reminders_sent (event_id, occurrence_date, remind_at)
         VALUES (?1, ?2, ?3)",
        params![event_id, occurrence_date, remind_at],
    )?;
    Ok(inserted == 1)
}

/// Descarta registros de lembretes com lembrete anterior a `now` menos a retenção.
pub fn prune_sent_reminders(connection: &Connection, now: LocalDateTime) -> AppResult<()> {
    let cutoff = now.add_minutes(-SENT_REMINDERS_RETENTION_DAYS * 24 * 60);
    connection.execute(
        "DELETE FROM calendar_reminders_sent WHERE remind_at < ?1",
        [cutoff.to_string()],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::domain::calendar_events::{EventInput, OccurrenceInput};
    use crate::domain::task_recurrence::RecurrenceFrequency;

    fn date(value: &str) -> CalendarDate {
        CalendarDate::parse(value).unwrap()
    }

    fn with_db(test: impl FnOnce(&Connection) -> AppResult<()>) {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| test(connection)).unwrap();
    }

    fn event(title: &str, recurring: bool) -> ValidEvent {
        EventInput {
            details: OccurrenceInput {
                title: title.into(),
                description: "Pauta".into(),
                location: "Sala 2".into(),
                all_day: false,
                start_date: "2026-09-21".into(),
                start_time: Some("09:00".into()),
                end_date: "2026-09-21".into(),
                end_time: Some("09:30".into()),
                reminder_minutes: Some(10),
            },
            color: CategoryColor::Teal,
            recurrence: recurring.then(|| EventRecurrence {
                frequency: RecurrenceFrequency::Daily,
                interval: 1,
                weekdays: vec![],
                until: None,
                count: Some(5),
            }),
        }
        .validate()
        .unwrap()
    }

    #[test]
    fn stores_and_reads_events() {
        with_db(|connection| {
            let valid = event("Daily", true);
            let id = insert(connection, &valid)?;
            let stored = find(connection, id)?;
            assert_eq!(stored.details, valid.details);
            assert_eq!(stored.recurrence, valid.recurrence);
            assert_eq!(stored.color, CategoryColor::Teal);

            let mut changed = event("Daily 2", false);
            changed.details.all_day = true;
            changed.details.start_time = None;
            changed.details.end_time = None;
            update(connection, id, &changed)?;
            let stored = find(connection, id)?;
            assert_eq!(stored.details.title, "Daily 2");
            assert!(stored.recurrence.is_none());
            assert!(matches!(
                update(connection, 999, &changed),
                Err(AppError::NotFound(_))
            ));
            Ok(())
        });
    }

    #[test]
    fn stores_exceptions_and_cascades_on_delete() {
        with_db(|connection| {
            let valid = event("Daily", true);
            let id = insert(connection, &valid)?;
            let mut moved = valid.details.shifted_to(date("2026-09-22"));
            moved.title = "Movida".into();
            moved.start_time = None;
            moved.end_time = None;
            moved.all_day = true;
            upsert_exception(connection, id, date("2026-09-22"), Some(&moved))?;
            upsert_exception(connection, id, date("2026-09-23"), None)?;
            // Substituir: cancelar uma ocorrência antes alterada.
            upsert_exception(connection, id, date("2026-09-22"), None)?;
            upsert_exception(connection, id, date("2026-09-24"), Some(&moved))?;

            let series = list(connection)?.remove(0);
            assert_eq!(series.exceptions.len(), 3);
            assert_eq!(series.exceptions[&date("2026-09-22")], None);
            assert_eq!(series.exceptions[&date("2026-09-24")], Some(moved));

            assert!(mark_reminder_sent(
                connection,
                id,
                "2026-09-21",
                "2026-09-21T08:50"
            )?);
            assert!(!mark_reminder_sent(
                connection,
                id,
                "2026-09-21",
                "2026-09-21T08:50"
            )?);

            assert_eq!(delete(connection, id)?, "Daily");
            let left: i64 = connection.query_row(
                "SELECT (SELECT COUNT(*) FROM calendar_event_exceptions)
                      + (SELECT COUNT(*) FROM calendar_reminders_sent)",
                [],
                |row| row.get(0),
            )?;
            assert_eq!(left, 0);
            assert!(matches!(find(connection, id), Err(AppError::NotFound(_))));
            Ok(())
        });
    }

    #[test]
    fn clears_exceptions_and_prunes_old_reminders() {
        with_db(|connection| {
            let id = insert(connection, &event("Daily", true))?;
            upsert_exception(connection, id, date("2026-09-22"), None)?;
            assert_eq!(delete_exceptions(connection, id)?, 1);

            mark_reminder_sent(connection, id, "2026-06-01", "2026-06-01T08:50")?;
            mark_reminder_sent(connection, id, "2026-09-21", "2026-09-21T08:50")?;
            prune_sent_reminders(
                connection,
                LocalDateTime::parse("2026-09-25T10:00").unwrap(),
            )?;
            let left: i64 = connection.query_row(
                "SELECT COUNT(*) FROM calendar_reminders_sent",
                [],
                |row| row.get(0),
            )?;
            assert_eq!(left, 1);
            Ok(())
        });
    }
}
