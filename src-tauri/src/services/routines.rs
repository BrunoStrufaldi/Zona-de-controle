//! Casos de uso de rotinas: montagem da visão (com sequência e consistência),
//! edição de hábitos preservando o histórico, marcação e exclusão auditada.

use std::collections::HashSet;

use rusqlite::Connection;
use serde_json::json;

use crate::db::Database;
use crate::domain::audit::{AuditCategory, AuditOutcome, NewAuditEntry};
use crate::domain::calendar::CalendarDate;
use crate::domain::routines::{
    ensure_markable, Habit, HabitSpan, Routine, RoutineDay, RoutineInput, Schedule, BACKFILL_DAYS,
    MAX_ROUTINES,
};
use crate::error::{AppError, AppResult};
use crate::repositories::routines::{self as repository, RoutineRow};
use crate::repositories::{audit, clock};

const ACTION_DELETED: &str = "routine.deleted";

pub fn list_routines(db: &Database) -> AppResult<Vec<Routine>> {
    db.with_connection(|connection| {
        let today = clock::local_today(connection)?;
        repository::list(connection)?
            .into_iter()
            .map(|row| build(connection, row, today))
            .collect()
    })
}

pub fn create_routine(db: &Database, input: RoutineInput) -> AppResult<Routine> {
    let routine = input.validate()?;
    if routine.habits.iter().any(|habit| habit.id.is_some()) {
        return Err(AppError::Validation(
            "uma rotina nova não pode ter hábitos existentes".into(),
        ));
    }
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        if repository::count(&transaction)? >= MAX_ROUTINES {
            return Err(AppError::Validation(format!(
                "é possível ter no máximo {MAX_ROUTINES} rotinas"
            )));
        }
        let today = clock::local_today(&transaction)?;
        let id = repository::insert(&transaction, &routine.name, routine.weekdays, today)?;
        for (position, habit) in routine.habits.iter().enumerate() {
            repository::insert_habit(&transaction, id, &habit.name, position as i64, today)?;
        }
        let created = build(&transaction, repository::find(&transaction, id)?, today)?;
        transaction.commit()?;
        Ok(created)
    })
}

/// Atualiza nome, dias e hábitos. Hábitos com `id` são renomeados/reordenados;
/// sem `id`, criados a partir de hoje; os que sumiram da lista deixam de valer
/// a partir de hoje (o histórico dos dias anteriores é mantido).
pub fn update_routine(db: &Database, id: i64, input: RoutineInput) -> AppResult<Routine> {
    let routine = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let today = clock::local_today(&transaction)?;
        repository::update(&transaction, id, &routine.name, routine.weekdays)?;

        let current: Vec<i64> = repository::habits_of(&transaction, id)?
            .into_iter()
            .filter(|habit| habit.span.removed_on.is_none())
            .map(|habit| habit.span.id)
            .collect();
        let kept: HashSet<i64> = routine.habits.iter().filter_map(|habit| habit.id).collect();
        if let Some(unknown) = kept.iter().find(|id| !current.contains(id)) {
            return Err(AppError::Validation(format!(
                "o hábito {unknown} não pertence a esta rotina"
            )));
        }

        for habit in current.iter().filter(|habit| !kept.contains(habit)) {
            repository::remove_habit(&transaction, *habit, today)?;
        }
        for (position, habit) in routine.habits.iter().enumerate() {
            let position = position as i64;
            match habit.id {
                Some(habit_id) => {
                    repository::update_habit(&transaction, habit_id, &habit.name, position)?
                }
                None => {
                    repository::insert_habit(&transaction, id, &habit.name, position, today)?;
                }
            }
        }

        let updated = build(&transaction, repository::find(&transaction, id)?, today)?;
        transaction.commit()?;
        Ok(updated)
    })
}

/// Marca ou desmarca um hábito em um dia (de hoje até `BACKFILL_DAYS` atrás,
/// só em dias da agenda em que o hábito valia). Retorna a rotina atualizada.
pub fn set_habit_done(db: &Database, habit_id: i64, date: &str, done: bool) -> AppResult<Routine> {
    let day = CalendarDate::parse(date)
        .ok_or_else(|| AppError::Validation(format!("data inválida: {date}")))?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let today = clock::local_today(&transaction)?;
        ensure_markable(day, today)?;

        let routine_id = repository::routine_of_habit(&transaction, habit_id)?;
        let row = repository::find(&transaction, routine_id)?;
        let spans = spans(&transaction, routine_id)?;
        let schedule = Schedule {
            weekdays: row.weekdays,
            start_date: row.start_date,
            habits: &spans,
        };
        if !schedule.is_scheduled(day) {
            return Err(AppError::Validation(
                "este dia não faz parte da agenda da rotina".into(),
            ));
        }
        if !schedule.habits_on(day).contains(&habit_id) {
            return Err(AppError::Validation(
                "o hábito não fazia parte da rotina neste dia".into(),
            ));
        }

        repository::set_completion(&transaction, habit_id, day, done)?;
        let routine = build(&transaction, row, today)?;
        transaction.commit()?;
        Ok(routine)
    })
}

/// Exclusão definitiva (hábitos e todo o histórico). Confirmada na interface e auditada.
pub fn delete_routine(db: &Database, id: i64) -> AppResult<()> {
    db.with_connection(|connection| {
        let target = id.to_string();
        let result: AppResult<()> = (|| {
            let transaction = connection.transaction()?;
            let (name, habits) = repository::delete(&transaction, id)?;
            audit::record(
                &transaction,
                &NewAuditEntry {
                    category: AuditCategory::Routines,
                    action: ACTION_DELETED,
                    target: Some(&target),
                    outcome: AuditOutcome::Success,
                    details: Some(json!({ "name": name, "habits": habits })),
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
                    category: AuditCategory::Routines,
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

fn spans(connection: &Connection, routine_id: i64) -> AppResult<Vec<HabitSpan>> {
    Ok(repository::habits_of(connection, routine_id)?
        .into_iter()
        .map(|habit| habit.span)
        .collect())
}

/// Monta a visão da rotina: hábitos atuais, últimos dias e estatísticas.
fn build(connection: &Connection, row: RoutineRow, today: CalendarDate) -> AppResult<Routine> {
    let habits = repository::habits_of(connection, row.id)?;
    let spans: Vec<HabitSpan> = habits.iter().map(|habit| habit.span).collect();
    let completions = repository::completions_of(connection, row.id)?;
    let schedule = Schedule {
        weekdays: row.weekdays,
        start_date: row.start_date,
        habits: &spans,
    };
    let stats = schedule.stats(&completions, today);

    let recent_days = (0..=BACKFILL_DAYS)
        .rev()
        .map(|offset| {
            let day = today.add_days(-offset);
            let habit_ids = schedule.habits_on(day);
            let done = completions.get(&day);
            RoutineDay {
                date: day.to_string(),
                scheduled: schedule.is_scheduled(day),
                completed_habit_ids: habit_ids
                    .iter()
                    .copied()
                    .filter(|id| done.is_some_and(|done| done.contains(id)))
                    .collect(),
                habit_ids,
            }
        })
        .collect();

    Ok(Routine {
        id: row.id,
        name: row.name,
        weekdays: row.weekdays.to_list(),
        start_date: row.start_date.to_string(),
        habits: habits
            .into_iter()
            .filter(|habit| habit.span.active_on(today))
            .map(|habit| Habit {
                id: habit.span.id,
                name: habit.name,
            })
            .collect(),
        recent_days,
        current_streak: stats.current_streak,
        best_streak: stats.best_streak,
        consistency: stats.consistency,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::routines::HabitInput;

    fn input(name: &str, habits: &[(Option<i64>, &str)]) -> RoutineInput {
        RoutineInput {
            name: name.into(),
            weekdays: vec![0, 1, 2, 3, 4, 5, 6],
            habits: habits
                .iter()
                .map(|(id, name)| HabitInput {
                    id: *id,
                    name: (*name).into(),
                })
                .collect(),
        }
    }

    fn today(db: &Database) -> CalendarDate {
        db.with_connection(|connection| clock::local_today(connection))
            .unwrap()
    }

    #[test]
    fn creates_and_marks_habits_today() {
        let db = Database::open_in_memory().unwrap();
        let routine =
            create_routine(&db, input("Manhã", &[(None, "Água"), (None, "Alongar")])).unwrap();
        assert_eq!(routine.habits.len(), 2);
        assert_eq!(routine.recent_days.len(), (BACKFILL_DAYS + 1) as usize);
        let today_status = routine.recent_days.last().unwrap();
        assert!(today_status.scheduled);
        // Dias antes da criação não fazem parte da agenda.
        assert!(!routine.recent_days[0].scheduled);

        let date = today(&db).to_string();
        for habit in &routine.habits {
            set_habit_done(&db, habit.id, &date, true).unwrap();
        }
        let done = &list_routines(&db).unwrap()[0];
        assert_eq!(done.current_streak, 1);
        assert_eq!(done.consistency, Some(1.0));

        let undone = set_habit_done(&db, routine.habits[0].id, &date, false).unwrap();
        // Hoje incompleto não quebra nem conta.
        assert_eq!(undone.current_streak, 0);
        assert_eq!(undone.consistency, None);
    }

    #[test]
    fn rejects_marks_outside_the_window_or_schedule() {
        let db = Database::open_in_memory().unwrap();
        let routine = create_routine(&db, input("Noite", &[(None, "Ler")])).unwrap();
        let habit = routine.habits[0].id;
        let today = today(&db);

        for day in [today.add_days(1), today.add_days(-(BACKFILL_DAYS + 1))] {
            assert!(matches!(
                set_habit_done(&db, habit, &day.to_string(), true),
                Err(AppError::Validation(_))
            ));
        }
        // Ontem é anterior à criação da rotina: fora da agenda.
        assert!(set_habit_done(&db, habit, &today.add_days(-1).to_string(), true).is_err());
        assert!(set_habit_done(&db, 999, &today.to_string(), true).is_err());
        assert!(set_habit_done(&db, habit, "25/09/2026", true).is_err());
    }

    #[test]
    fn editing_keeps_renames_and_removes_habits_from_today() {
        let db = Database::open_in_memory().unwrap();
        let routine =
            create_routine(&db, input("Manhã", &[(None, "Água"), (None, "Café")])).unwrap();
        let (water, coffee) = (routine.habits[0].id, routine.habits[1].id);

        let updated = update_routine(
            &db,
            routine.id,
            input(
                "Manhã cedo",
                &[(None, "Meditar"), (Some(water), "Beber água")],
            ),
        )
        .unwrap();

        let names: Vec<_> = updated.habits.iter().map(|h| h.name.as_str()).collect();
        assert_eq!(updated.name, "Manhã cedo");
        assert_eq!(names, vec!["Meditar", "Beber água"]);
        assert!(!updated.habits.iter().any(|habit| habit.id == coffee));

        // Hábito de outra rotina não pode ser usado aqui.
        let other = create_routine(&db, input("Noite", &[(None, "Ler")])).unwrap();
        assert!(update_routine(
            &db,
            routine.id,
            input("Manhã cedo", &[(Some(other.habits[0].id), "Ler")])
        )
        .is_err());
    }

    #[test]
    fn delete_is_audited() {
        let db = Database::open_in_memory().unwrap();
        let routine = create_routine(&db, input("Academia", &[(None, "Treinar")])).unwrap();

        delete_routine(&db, routine.id).unwrap();
        assert!(delete_routine(&db, routine.id).is_err());

        let log = db
            .with_connection(|connection| audit::list_recent(connection, 10))
            .unwrap();
        assert_eq!(log.len(), 2);
        assert_eq!(log[0].outcome, "failure");
        assert_eq!(log[1].category, "routines");
        assert_eq!(
            log[1].details,
            Some(json!({ "name": "Academia", "habits": 1 }))
        );
        assert!(list_routines(&db).unwrap().is_empty());
    }
}
