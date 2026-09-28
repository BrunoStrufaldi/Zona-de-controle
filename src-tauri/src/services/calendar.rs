//! Casos de uso do calendário: agenda de um intervalo (eventos + tarefas),
//! edição da série ou de uma ocorrência, exclusões auditadas e lembretes.

use rusqlite::Connection;
use serde_json::json;

use crate::db::Database;
use crate::domain::audit::{AuditCategory, AuditOutcome, NewAuditEntry};
use crate::domain::calendar::CalendarDate;
use crate::domain::calendar_events::{
    due_reminders, CalendarAgenda, CalendarEvent, CalendarTask, DueReminder, EventInput,
    OccurrenceInput, Series, MAX_RANGE_DAYS,
};
use crate::error::{AppError, AppResult};
use crate::repositories::calendar_events as repository;
use crate::repositories::{audit, clock, tasks};

const ACTION_DELETED: &str = "event.deleted";
const ACTION_OCCURRENCE_DELETED: &str = "event.occurrence_deleted";
const ACTION_EXCEPTIONS_RESET: &str = "event.exceptions_reset";

fn parse_date(value: &str) -> AppResult<CalendarDate> {
    CalendarDate::parse(value)
        .ok_or_else(|| AppError::Validation(format!("data inválida: {value}")))
}

/// Ocorrências e tarefas (não arquivadas) com vencimento entre `from` e `to`.
pub fn list_calendar(db: &Database, from: &str, to: &str) -> AppResult<CalendarAgenda> {
    let (from, to) = (parse_date(from)?, parse_date(to)?);
    if to < from {
        return Err(AppError::Validation(
            "o fim do intervalo é anterior ao início".into(),
        ));
    }
    if from.days_until(to) >= MAX_RANGE_DAYS {
        return Err(AppError::Validation(format!(
            "consulte no máximo {MAX_RANGE_DAYS} dias por vez"
        )));
    }

    db.with_connection(|connection| {
        let mut events = Vec::new();
        let mut occurrences = Vec::new();
        for series in repository::list(connection)? {
            let found = series.occurrences(from, to);
            if found.is_empty() {
                continue;
            }
            occurrences.extend(
                found
                    .iter()
                    .map(|occurrence| series.to_occurrence(occurrence)),
            );
            events.push(series.to_event());
        }
        occurrences.sort_by(|a, b| {
            (&a.start_date, !a.all_day, &a.start_time, &a.title).cmp(&(
                &b.start_date,
                !b.all_day,
                &b.start_time,
                &b.title,
            ))
        });

        let (from_text, to_text) = (from.to_string(), to.to_string());
        let tasks = tasks::list(connection)?
            .into_iter()
            .filter_map(|task| {
                let due = task.due_date?;
                (due >= from_text && due <= to_text).then_some(CalendarTask {
                    id: task.id,
                    title: task.title,
                    due_date: due,
                    status: task.status,
                    priority: task.priority,
                })
            })
            .collect();

        Ok(CalendarAgenda {
            events,
            occurrences,
            tasks,
        })
    })
}

pub fn create_event(db: &Database, input: EventInput) -> AppResult<CalendarEvent> {
    let event = input.validate()?;
    db.with_connection(|connection| {
        let id = repository::insert(connection, &event)?;
        Ok(repository::find(connection, id)?.to_event())
    })
}

/// Edita a série. Se a data de início ou a repetição mudarem, as datas das
/// ocorrências mudam e as alterações individuais (exceções) são descartadas;
/// o descarte é auditado.
pub fn update_event(db: &Database, id: i64, input: EventInput) -> AppResult<CalendarEvent> {
    let event = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let current = repository::find(&transaction, id)?;
        repository::update(&transaction, id, &event)?;

        let dates_changed = current.details.start_date != event.details.start_date
            || current.recurrence != event.recurrence;
        if dates_changed && !current.exceptions.is_empty() {
            let removed = repository::delete_exceptions(&transaction, id)?;
            audit::record(
                &transaction,
                &NewAuditEntry {
                    category: AuditCategory::Calendar,
                    action: ACTION_EXCEPTIONS_RESET,
                    target: Some(&id.to_string()),
                    outcome: AuditOutcome::Success,
                    details: Some(json!({ "title": event.details.title, "exceptions": removed })),
                },
            )?;
        }

        let updated = repository::find(&transaction, id)?.to_event();
        transaction.commit()?;
        Ok(updated)
    })
}

/// Altera só uma ocorrência de uma série recorrente.
pub fn update_occurrence(
    db: &Database,
    event_id: i64,
    occurrence_date: &str,
    input: OccurrenceInput,
) -> AppResult<()> {
    let date = parse_date(occurrence_date)?;
    let details = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let series = repository::find(&transaction, event_id)?;
        ensure_active_occurrence(&series, date)?;
        repository::upsert_exception(&transaction, event_id, date, Some(&details))?;
        transaction.commit()?;
        Ok(())
    })
}

/// Exclusão definitiva da série (com todas as ocorrências). Confirmada na interface e auditada.
pub fn delete_event(db: &Database, id: i64) -> AppResult<()> {
    db.with_connection(|connection| {
        audited(connection, ACTION_DELETED, &id.to_string(), |transaction| {
            let recurring = repository::find(transaction, id)?.recurrence.is_some();
            let title = repository::delete(transaction, id)?;
            Ok(json!({ "title": title, "recurring": recurring }))
        })
    })
}

/// Exclui só uma ocorrência (vira uma exceção cancelada). Confirmada e auditada.
pub fn delete_occurrence(db: &Database, event_id: i64, occurrence_date: &str) -> AppResult<()> {
    let target = format!("{event_id}@{occurrence_date}");
    db.with_connection(|connection| {
        audited(
            connection,
            ACTION_OCCURRENCE_DELETED,
            &target,
            |transaction| {
                let date = parse_date(occurrence_date)?;
                let series = repository::find(transaction, event_id)?;
                ensure_active_occurrence(&series, date)?;
                let title = series
                    .exceptions
                    .get(&date)
                    .and_then(|details| details.as_ref())
                    .map_or(&series.details.title, |details| &details.title)
                    .clone();
                repository::upsert_exception(transaction, event_id, date, None)?;
                Ok(json!({ "title": title, "date": occurrence_date }))
            },
        )
    })
}

/// Lembretes que venceram agora (até 15 min de atraso) e ainda não foram
/// avisados. Cada um é marcado como enviado, então é devolvido uma única vez.
pub fn claim_due_reminders(db: &Database) -> AppResult<Vec<DueReminder>> {
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let now = clock::local_now(&transaction)?;
        let series = repository::list(&transaction)?;
        let mut claimed = Vec::new();
        for reminder in due_reminders(&series, now) {
            if repository::mark_reminder_sent(
                &transaction,
                reminder.event_id,
                &reminder.occurrence_date,
                &reminder.remind_at,
            )? {
                claimed.push(reminder);
            }
        }
        repository::prune_sent_reminders(&transaction, now)?;
        transaction.commit()?;
        Ok(claimed)
    })
}

/// A ocorrência existe na série recorrente e não foi excluída.
fn ensure_active_occurrence(series: &Series, date: CalendarDate) -> AppResult<()> {
    if series.recurrence.is_none() {
        return Err(AppError::Validation(
            "o evento não se repete; edite o evento inteiro".into(),
        ));
    }
    if !series.is_rule_date(date) || series.is_cancelled(date) {
        return Err(AppError::NotFound("ocorrência não encontrada"));
    }
    Ok(())
}

/// Executa uma exclusão numa transação e audita o sucesso (com os detalhes
/// devolvidos) ou a falha.
fn audited(
    connection: &mut Connection,
    action: &str,
    target: &str,
    operation: impl FnOnce(&Connection) -> AppResult<serde_json::Value>,
) -> AppResult<()> {
    let result: AppResult<()> = (|| {
        let transaction = connection.transaction()?;
        let details = operation(&transaction)?;
        audit::record(
            &transaction,
            &NewAuditEntry {
                category: AuditCategory::Calendar,
                action,
                target: Some(target),
                outcome: AuditOutcome::Success,
                details: Some(details),
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
                category: AuditCategory::Calendar,
                action,
                target: Some(target),
                outcome: AuditOutcome::Failure,
                details: Some(json!({ "error": error.to_string() })),
            },
        );
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::calendar_events::EventRecurrence;
    use crate::domain::task_categories::CategoryColor;
    use crate::domain::task_recurrence::RecurrenceFrequency;
    use crate::domain::tasks::{TaskInput, TaskPriority, TaskStatus};
    use crate::services::tasks as task_service;

    fn details(title: &str, date: &str, time: Option<&str>) -> OccurrenceInput {
        OccurrenceInput {
            title: title.into(),
            description: String::new(),
            location: String::new(),
            all_day: time.is_none(),
            start_date: date.into(),
            start_time: time.map(Into::into),
            end_date: date.into(),
            end_time: time.map(Into::into),
            reminder_minutes: None,
        }
    }

    fn input(title: &str, date: &str, recurrence: Option<RecurrenceFrequency>) -> EventInput {
        EventInput {
            details: details(title, date, Some("10:00")),
            color: CategoryColor::Blue,
            recurrence: recurrence.map(|frequency| EventRecurrence {
                frequency,
                interval: 1,
                weekdays: vec![],
                until: None,
                count: None,
            }),
        }
    }

    fn audit_log(db: &Database) -> Vec<crate::repositories::audit::AuditEntry> {
        db.with_connection(|connection| audit::list_recent(connection, 20))
            .unwrap()
    }

    #[test]
    fn lists_occurrences_and_tasks_in_a_range() {
        let db = Database::open_in_memory().unwrap();
        create_event(
            &db,
            input("Aula", "2026-09-01", Some(RecurrenceFrequency::Weekly)),
        )
        .unwrap();
        create_event(&db, input("Consulta", "2026-09-24", None)).unwrap();
        create_event(&db, input("Fora", "2026-12-01", None)).unwrap();
        task_service::create_task(
            &db,
            TaskInput {
                title: "Pagar conta".into(),
                description: String::new(),
                status: TaskStatus::Todo,
                priority: TaskPriority::High,
                due_date: Some("2026-09-23".into()),
                tags: vec![],
                category_id: None,
                recurrence: None,
                checklist: vec![],
            },
        )
        .unwrap();

        let agenda = list_calendar(&db, "2026-09-20", "2026-09-26").unwrap();
        let titles: Vec<_> = agenda
            .occurrences
            .iter()
            .map(|occurrence| (occurrence.title.as_str(), occurrence.start_date.as_str()))
            .collect();
        assert_eq!(titles, [("Aula", "2026-09-22"), ("Consulta", "2026-09-24")]);
        assert_eq!(agenda.events.len(), 2);
        assert_eq!(agenda.tasks.len(), 1);
        assert_eq!(agenda.tasks[0].title, "Pagar conta");

        assert!(list_calendar(&db, "2026-09-26", "2026-09-20").is_err());
        assert!(list_calendar(&db, "2026-01-01", "2026-12-31").is_err());
        assert!(list_calendar(&db, "20/09/2026", "2026-09-26").is_err());
    }

    #[test]
    fn edits_and_deletes_single_occurrences() {
        let db = Database::open_in_memory().unwrap();
        let event = create_event(
            &db,
            input("Daily", "2026-09-21", Some(RecurrenceFrequency::Daily)),
        )
        .unwrap();

        update_occurrence(
            &db,
            event.id,
            "2026-09-22",
            details("Daily longa", "2026-09-22", Some("11:00")),
        )
        .unwrap();
        delete_occurrence(&db, event.id, "2026-09-23").unwrap();
        // Ocorrência inexistente ou já excluída.
        assert!(delete_occurrence(&db, event.id, "2026-09-23").is_err());
        assert!(update_occurrence(
            &db,
            event.id,
            "2026-09-20",
            details("x", "2026-09-20", None)
        )
        .is_err());

        let agenda = list_calendar(&db, "2026-09-21", "2026-09-24").unwrap();
        let days: Vec<_> = agenda
            .occurrences
            .iter()
            .map(|occurrence| {
                (
                    occurrence.occurrence_date.as_str(),
                    occurrence.title.as_str(),
                    occurrence.modified,
                )
            })
            .collect();
        assert_eq!(
            days,
            [
                ("2026-09-21", "Daily", false),
                ("2026-09-22", "Daily longa", true),
                ("2026-09-24", "Daily", false),
            ]
        );

        let log = audit_log(&db);
        assert_eq!(log[0].outcome, "failure");
        assert_eq!(log[1].action, ACTION_OCCURRENCE_DELETED);
        assert_eq!(
            log[1].details,
            Some(json!({ "title": "Daily", "date": "2026-09-23" }))
        );

        // Evento sem repetição não tem ocorrências avulsas.
        let single = create_event(&db, input("Único", "2026-09-25", None)).unwrap();
        assert!(matches!(
            update_occurrence(
                &db,
                single.id,
                "2026-09-25",
                details("x", "2026-09-25", None)
            ),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn changing_the_series_dates_resets_exceptions() {
        let db = Database::open_in_memory().unwrap();
        let event = create_event(
            &db,
            input("Daily", "2026-09-21", Some(RecurrenceFrequency::Daily)),
        )
        .unwrap();
        delete_occurrence(&db, event.id, "2026-09-22").unwrap();

        // Só o título: a exceção continua.
        update_event(
            &db,
            event.id,
            input("Daily 2", "2026-09-21", Some(RecurrenceFrequency::Daily)),
        )
        .unwrap();
        assert_eq!(
            list_calendar(&db, "2026-09-21", "2026-09-23")
                .unwrap()
                .occurrences
                .len(),
            2
        );

        // Nova regra: a exceção é descartada (e auditada).
        update_event(
            &db,
            event.id,
            input("Daily 2", "2026-09-21", Some(RecurrenceFrequency::Weekly)),
        )
        .unwrap();
        update_event(
            &db,
            event.id,
            input("Daily 2", "2026-09-21", Some(RecurrenceFrequency::Daily)),
        )
        .unwrap();
        assert_eq!(
            list_calendar(&db, "2026-09-21", "2026-09-23")
                .unwrap()
                .occurrences
                .len(),
            3
        );
        let log = audit_log(&db);
        assert_eq!(log[0].action, ACTION_EXCEPTIONS_RESET);
        assert_eq!(
            log[0].details,
            Some(json!({ "title": "Daily 2", "exceptions": 1 }))
        );
    }

    #[test]
    fn delete_is_audited() {
        let db = Database::open_in_memory().unwrap();
        let event = create_event(
            &db,
            input("Aula", "2026-09-21", Some(RecurrenceFrequency::Weekly)),
        )
        .unwrap();
        delete_event(&db, event.id).unwrap();
        assert!(delete_event(&db, event.id).is_err());

        let log = audit_log(&db);
        assert_eq!(log.len(), 2);
        assert_eq!(log[0].outcome, "failure");
        assert_eq!(log[1].category, "calendar");
        assert_eq!(
            log[1].details,
            Some(json!({ "title": "Aula", "recurring": true }))
        );
        assert!(list_calendar(&db, "2026-09-21", "2026-09-30")
            .unwrap()
            .occurrences
            .is_empty());
    }

    #[test]
    fn claims_each_due_reminder_once() {
        let db = Database::open_in_memory().unwrap();
        let now = db
            .with_connection(|connection| clock::local_now(connection))
            .unwrap();
        // Começa em 5 minutos, com lembrete 10 minutos antes: já venceu.
        let start = now.add_minutes(5);
        let mut soon = input("Reunião", &start.date.to_string(), None);
        soon.details.start_time = Some(start.time.to_string());
        soon.details.end_date = start.add_minutes(30).date.to_string();
        soon.details.end_time = Some(start.add_minutes(30).time.to_string());
        soon.details.reminder_minutes = Some(10);
        create_event(&db, soon).unwrap();

        let claimed = claim_due_reminders(&db).unwrap();
        assert_eq!(claimed.len(), 1);
        assert_eq!(claimed[0].title, "Reunião");
        assert!(claim_due_reminders(&db).unwrap().is_empty());
    }
}
