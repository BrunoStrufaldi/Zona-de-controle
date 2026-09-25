//! Rotinas e hábitos: contratos, validação e cálculo de sequência/consistência.
//! Espelhado em `src/features/productivity/routines/types.ts`.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::domain::calendar::{CalendarDate, Weekday};
use crate::error::{AppError, AppResult};

pub const MAX_NAME_CHARS: usize = 80;
pub const MAX_HABITS: usize = 20;
pub const MAX_ROUTINES: usize = 50;
/// Hábitos podem ser marcados de hoje até este número de dias atrás.
pub const BACKFILL_DAYS: i64 = 7;
/// Janela da consistência exibida (inclui hoje).
pub const CONSISTENCY_WINDOW_DAYS: i64 = 30;

/// Dias da semana em que a rotina é feita (bit 0 = domingo … bit 6 = sábado).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Weekdays(u8);

impl Weekdays {
    #[cfg(test)]
    pub const ALL: Self = Self(0b111_1111);

    /// Converte a lista `[0..=6]` (sem repetição), exigindo ao menos um dia.
    pub fn from_list(days: &[Weekday]) -> AppResult<Self> {
        let mut mask = 0u8;
        for &day in days {
            if day > 6 {
                return Err(AppError::Validation(format!(
                    "dia da semana inválido: {day}"
                )));
            }
            mask |= 1 << day;
        }
        if mask == 0 {
            return Err(AppError::Validation(
                "escolha pelo menos um dia da semana".into(),
            ));
        }
        Ok(Self(mask))
    }

    pub fn from_mask(mask: i64) -> AppResult<Self> {
        match u8::try_from(mask) {
            Ok(mask @ 1..=127) => Ok(Self(mask)),
            _ => Err(AppError::Validation(format!(
                "dias da semana inválidos: {mask}"
            ))),
        }
    }

    pub fn mask(self) -> i64 {
        i64::from(self.0)
    }

    pub fn contains(self, day: Weekday) -> bool {
        self.0 & (1 << day) != 0
    }

    pub fn to_list(self) -> Vec<Weekday> {
        (0..7).filter(|&day| self.contains(day)).collect()
    }
}

// ---- Contrato com o frontend ---------------------------------------------------

/// Hábito no formulário: com `id` mantém (e renomeia) um existente; sem `id`, cria.
/// Hábitos existentes que não vierem na lista são removidos dali em diante.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitInput {
    #[serde(default)]
    pub id: Option<i64>,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineInput {
    pub name: String,
    pub weekdays: Vec<Weekday>,
    pub habits: Vec<HabitInput>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidRoutine {
    pub name: String,
    pub weekdays: Weekdays,
    /// Na ordem de exibição.
    pub habits: Vec<HabitInput>,
}

fn collapse_spaces(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

impl RoutineInput {
    pub fn validate(self) -> AppResult<ValidRoutine> {
        let name = collapse_spaces(&self.name);
        if name.is_empty() {
            return Err(AppError::Validation(
                "o nome da rotina é obrigatório".into(),
            ));
        }
        if name.chars().count() > MAX_NAME_CHARS {
            return Err(AppError::Validation(format!(
                "o nome da rotina pode ter no máximo {MAX_NAME_CHARS} caracteres"
            )));
        }

        let habits: Vec<HabitInput> = self
            .habits
            .into_iter()
            .map(|habit| HabitInput {
                id: habit.id,
                name: collapse_spaces(&habit.name),
            })
            .filter(|habit| !habit.name.is_empty())
            .collect();
        if habits.is_empty() {
            return Err(AppError::Validation(
                "a rotina precisa de pelo menos um hábito".into(),
            ));
        }
        if habits.len() > MAX_HABITS {
            return Err(AppError::Validation(format!(
                "uma rotina pode ter no máximo {MAX_HABITS} hábitos"
            )));
        }
        if habits
            .iter()
            .any(|habit| habit.name.chars().count() > MAX_NAME_CHARS)
        {
            return Err(AppError::Validation(format!(
                "cada hábito pode ter no máximo {MAX_NAME_CHARS} caracteres"
            )));
        }
        let mut ids = HashSet::new();
        if habits
            .iter()
            .filter_map(|habit| habit.id)
            .any(|id| !ids.insert(id))
        {
            return Err(AppError::Validation("hábito repetido na rotina".into()));
        }

        Ok(ValidRoutine {
            name,
            weekdays: Weekdays::from_list(&self.weekdays)?,
            habits,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Habit {
    pub id: i64,
    pub name: String,
}

/// Situação de um dia recente (grade de marcação).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineDay {
    pub date: String,
    /// Dia da agenda (dia da semana escolhido, a partir do início da rotina).
    pub scheduled: bool,
    /// Hábitos que valiam naquele dia.
    pub habit_ids: Vec<i64>,
    pub completed_habit_ids: Vec<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Routine {
    pub id: i64,
    pub name: String,
    pub weekdays: Vec<Weekday>,
    pub start_date: String,
    /// Hábitos atuais, na ordem de exibição.
    pub habits: Vec<Habit>,
    /// De `BACKFILL_DAYS` dias atrás até hoje (o último é hoje).
    pub recent_days: Vec<RoutineDay>,
    pub current_streak: u32,
    pub best_streak: u32,
    /// Fração de dias programados completos nos últimos 30 dias; `None` sem dias programados.
    pub consistency: Option<f64>,
}

// ---- Cálculos ----------------------------------------------------------------

/// Período de validade de um hábito: de `created_on` (inclusive) a `removed_on` (exclusive).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HabitSpan {
    pub id: i64,
    pub created_on: CalendarDate,
    pub removed_on: Option<CalendarDate>,
}

impl HabitSpan {
    pub fn active_on(&self, day: CalendarDate) -> bool {
        self.created_on <= day && !matches!(self.removed_on, Some(removed) if removed <= day)
    }
}

/// Hábitos feitos por dia.
pub type Completions = HashMap<CalendarDate, HashSet<i64>>;

/// Agenda de uma rotina e seus hábitos ao longo do tempo.
#[derive(Debug, Clone)]
pub struct Schedule<'a> {
    pub weekdays: Weekdays,
    pub start_date: CalendarDate,
    pub habits: &'a [HabitSpan],
}

/// Situação de um dia da agenda.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DayOutcome {
    /// Fora da agenda (ou sem hábitos): não conta nem quebra a sequência.
    Skipped,
    Complete,
    Incomplete,
}

impl Schedule<'_> {
    pub fn is_scheduled(&self, day: CalendarDate) -> bool {
        day >= self.start_date && self.weekdays.contains(day.weekday())
    }

    pub fn habits_on(&self, day: CalendarDate) -> Vec<i64> {
        self.habits
            .iter()
            .filter(|habit| habit.active_on(day))
            .map(|habit| habit.id)
            .collect()
    }

    fn outcome(&self, day: CalendarDate, completions: &Completions) -> DayOutcome {
        if !self.is_scheduled(day) {
            return DayOutcome::Skipped;
        }
        let habits = self.habits_on(day);
        if habits.is_empty() {
            return DayOutcome::Skipped;
        }
        let done = completions.get(&day);
        let complete = habits
            .iter()
            .all(|id| done.is_some_and(|done| done.contains(id)));
        if complete {
            DayOutcome::Complete
        } else {
            DayOutcome::Incomplete
        }
    }

    /// Sequência atual, recorde e consistência. Hoje incompleto não quebra a
    /// sequência nem entra na consistência (o dia ainda não acabou).
    pub fn stats(&self, completions: &Completions, today: CalendarDate) -> RoutineStats {
        let mut current = 0u32;
        let mut best = 0u32;
        let window_start = today.add_days(1 - CONSISTENCY_WINDOW_DAYS);
        let (mut window_days, mut window_complete) = (0u32, 0u32);

        let mut day = self.start_date;
        while day <= today {
            let outcome = self.outcome(day, completions);
            let pending_today = day == today && outcome == DayOutcome::Incomplete;
            match outcome {
                DayOutcome::Complete => {
                    current += 1;
                    best = best.max(current);
                }
                DayOutcome::Incomplete if !pending_today => current = 0,
                _ => {}
            }
            if day >= window_start && outcome != DayOutcome::Skipped && !pending_today {
                window_days += 1;
                window_complete += u32::from(outcome == DayOutcome::Complete);
            }
            day = day.add_days(1);
        }

        RoutineStats {
            current_streak: current,
            best_streak: best,
            consistency: (window_days > 0)
                .then(|| f64::from(window_complete) / f64::from(window_days)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RoutineStats {
    pub current_streak: u32,
    pub best_streak: u32,
    pub consistency: Option<f64>,
}

/// Um dia pode ser marcado se estiver entre `BACKFILL_DAYS` atrás e hoje.
pub fn ensure_markable(day: CalendarDate, today: CalendarDate) -> AppResult<()> {
    if day > today {
        return Err(AppError::Validation(
            "não é possível marcar dias futuros".into(),
        ));
    }
    if day < today.add_days(-BACKFILL_DAYS) {
        return Err(AppError::Validation(format!(
            "só é possível marcar até {BACKFILL_DAYS} dias atrás"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(value: &str) -> CalendarDate {
        CalendarDate::parse(value).unwrap()
    }

    fn span(id: i64, created: &str, removed: Option<&str>) -> HabitSpan {
        HabitSpan {
            id,
            created_on: date(created),
            removed_on: removed.map(date),
        }
    }

    /// Marca os hábitos `ids` como feitos nos dias informados.
    fn done(entries: &[(&str, &[i64])]) -> Completions {
        entries
            .iter()
            .map(|(day, ids)| (date(day), ids.iter().copied().collect()))
            .collect()
    }

    fn input(name: &str, habits: &[&str]) -> RoutineInput {
        RoutineInput {
            name: name.into(),
            weekdays: vec![1, 3, 5],
            habits: habits
                .iter()
                .map(|name| HabitInput {
                    id: None,
                    name: (*name).into(),
                })
                .collect(),
        }
    }

    #[test]
    fn weekday_masks_round_trip() {
        let days = Weekdays::from_list(&[5, 1, 3, 1]).unwrap();
        assert_eq!(days.to_list(), vec![1, 3, 5]);
        assert_eq!(Weekdays::from_mask(days.mask()).unwrap(), days);
        assert_eq!(Weekdays::ALL.to_list().len(), 7);
        assert!(Weekdays::from_list(&[]).is_err());
        assert!(Weekdays::from_list(&[7]).is_err());
        assert!(Weekdays::from_mask(0).is_err());
        assert!(Weekdays::from_mask(128).is_err());
    }

    #[test]
    fn validates_and_normalizes_input() {
        let valid = input("  Rotina   matinal ", &[" Beber água ", "", "Alongar"])
            .validate()
            .unwrap();
        assert_eq!(valid.name, "Rotina matinal");
        let names: Vec<_> = valid.habits.iter().map(|h| h.name.as_str()).collect();
        assert_eq!(names, vec!["Beber água", "Alongar"]);

        assert!(input(" ", &["x"]).validate().is_err());
        assert!(input("Sem hábitos", &["  "]).validate().is_err());
        let too_many: Vec<String> = (0..=MAX_HABITS).map(|i| format!("h{i}")).collect();
        let refs: Vec<&str> = too_many.iter().map(String::as_str).collect();
        assert!(input("Muitos", &refs).validate().is_err());

        let mut repeated = input("Repetido", &["a", "b"]);
        repeated.habits[0].id = Some(1);
        repeated.habits[1].id = Some(1);
        assert!(repeated.validate().is_err());
    }

    #[test]
    fn habits_are_active_within_their_span() {
        let habit = span(1, "2026-09-10", Some("2026-09-20"));
        assert!(!habit.active_on(date("2026-09-09")));
        assert!(habit.active_on(date("2026-09-10")));
        assert!(habit.active_on(date("2026-09-19")));
        assert!(!habit.active_on(date("2026-09-20")));
    }

    #[test]
    fn streak_counts_complete_scheduled_days_and_ignores_others() {
        // Seg/qua/sex a partir de 2026-09-14 (segunda).
        let habits = [span(1, "2026-09-14", None), span(2, "2026-09-14", None)];
        let schedule = Schedule {
            weekdays: Weekdays::from_list(&[1, 3, 5]).unwrap(),
            start_date: date("2026-09-14"),
            habits: &habits,
        };
        let completions = done(&[
            ("2026-09-14", &[1, 2]), // seg completo
            ("2026-09-16", &[1]),    // qua incompleto → quebra
            ("2026-09-18", &[1, 2]), // sex
            ("2026-09-21", &[1, 2]), // seg
            ("2026-09-22", &[1, 2]), // ter: fora da agenda, ignorado
            ("2026-09-23", &[1, 2]), // qua
        ]);

        // Sexta (hoje) ainda sem marcação não quebra a sequência.
        let stats = schedule.stats(&completions, date("2026-09-25"));
        assert_eq!(stats.current_streak, 3);
        assert_eq!(stats.best_streak, 3);
        // Dias contados: 14, 16, 18, 21, 23 (hoje pendente fica de fora) → 4 de 5.
        assert_eq!(stats.consistency, Some(0.8));

        // No sábado, a sexta incompleta quebra a sequência.
        let next_day = schedule.stats(&completions, date("2026-09-26"));
        assert_eq!(next_day.current_streak, 0);
        assert_eq!(next_day.best_streak, 3);
    }

    #[test]
    fn removed_and_new_habits_only_count_in_their_period() {
        let habits = [
            span(1, "2026-09-20", None),
            span(2, "2026-09-20", Some("2026-09-23")), // removido
            span(3, "2026-09-24", None),               // novo
        ];
        let schedule = Schedule {
            weekdays: Weekdays::ALL,
            start_date: date("2026-09-20"),
            habits: &habits,
        };
        let completions = done(&[
            ("2026-09-20", &[1, 2]),
            ("2026-09-21", &[1, 2]),
            ("2026-09-22", &[1, 2]),
            ("2026-09-23", &[1]),
            ("2026-09-24", &[1, 3]),
        ]);
        let stats = schedule.stats(&completions, date("2026-09-24"));
        assert_eq!(stats.current_streak, 5);
        assert_eq!(stats.consistency, Some(1.0));
        assert_eq!(schedule.habits_on(date("2026-09-22")), vec![1, 2]);
        assert_eq!(schedule.habits_on(date("2026-09-24")), vec![1, 3]);
    }

    #[test]
    fn nothing_scheduled_yet_means_no_consistency() {
        let habits = [span(1, "2026-09-25", None)];
        let schedule = Schedule {
            weekdays: Weekdays::ALL,
            start_date: date("2026-09-25"),
            habits: &habits,
        };
        let stats = schedule.stats(&Completions::new(), date("2026-09-25"));
        assert_eq!(stats.current_streak, 0);
        assert_eq!(stats.consistency, None);
        assert!(!schedule.is_scheduled(date("2026-09-24")));
    }

    #[test]
    fn marking_window_is_today_back_to_seven_days() {
        let today = date("2026-09-25");
        assert!(ensure_markable(today, today).is_ok());
        assert!(ensure_markable(date("2026-09-18"), today).is_ok());
        assert!(ensure_markable(date("2026-09-17"), today).is_err());
        assert!(ensure_markable(date("2026-09-26"), today).is_err());
    }
}
