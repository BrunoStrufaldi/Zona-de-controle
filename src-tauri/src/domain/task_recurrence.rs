//! Recorrência de tarefas: a regra e o cálculo da próxima ocorrência.
//! Espelhado em `src/features/productivity/tasks/domain/recurrence.ts`.
//!
//! Modelo "gera ao concluir": ao concluir uma tarefa recorrente, uma nova
//! tarefa é criada com o próximo vencimento e a regra passa para ela.

use serde::{Deserialize, Serialize};

use crate::domain::calendar::{CalendarDate, Weekday};
use crate::error::{AppError, AppResult};

pub const MAX_INTERVAL: u32 = 99;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecurrenceFrequency {
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

/// Regra de repetição: a cada `interval` dias/semanas/meses/anos. Na semanal,
/// `weekdays` (0 = domingo) escolhe os dias; vazio = mesmo dia da semana do vencimento.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recurrence {
    pub frequency: RecurrenceFrequency,
    #[serde(default = "default_interval")]
    pub interval: u32,
    #[serde(default)]
    pub weekdays: Vec<Weekday>,
}

fn default_interval() -> u32 {
    1
}

impl Recurrence {
    /// Valida o intervalo e normaliza os dias da semana (ordenados, sem
    /// duplicatas; descartados fora da frequência semanal).
    pub fn validate(mut self) -> AppResult<Self> {
        if !(1..=MAX_INTERVAL).contains(&self.interval) {
            return Err(AppError::Validation(format!(
                "o intervalo da recorrência deve estar entre 1 e {MAX_INTERVAL}"
            )));
        }
        if self.weekdays.iter().any(|day| *day > 6) {
            return Err(AppError::Validation(
                "dia da semana inválido na recorrência".into(),
            ));
        }
        if self.frequency == RecurrenceFrequency::Weekly {
            self.weekdays.sort_unstable();
            self.weekdays.dedup();
        } else {
            self.weekdays.clear();
        }
        Ok(self)
    }

    /// Próximo vencimento: a primeira data da regra depois de `due` **e** depois
    /// de `today`. Assim, concluir com atraso não gera uma ocorrência já vencida.
    pub fn next_occurrence(&self, due: CalendarDate, today: CalendarDate) -> CalendarDate {
        let interval = i64::from(self.interval);
        match self.frequency {
            RecurrenceFrequency::Daily => next_by_days(due, today, interval),
            RecurrenceFrequency::Weekly if self.weekdays.is_empty() => {
                next_by_days(due, today, interval * 7)
            }
            RecurrenceFrequency::Weekly => {
                let mut next = next_weekday(due, &self.weekdays, interval);
                while next <= today {
                    next = next_weekday(next, &self.weekdays, interval);
                }
                next
            }
            RecurrenceFrequency::Monthly | RecurrenceFrequency::Yearly => {
                let months = if self.frequency == RecurrenceFrequency::Monthly {
                    interval
                } else {
                    interval * 12
                };
                // Conta a partir do vencimento original para não "escorregar" o dia
                // (31/01 → 28/02 → 31/03).
                let mut step = 1;
                loop {
                    let next = due.add_months(months * step, due.day());
                    if next > today {
                        return next;
                    }
                    step += 1;
                }
            }
        }
    }
}

/// Primeira data `due + k * step` (k ≥ 1) posterior a `today`.
fn next_by_days(due: CalendarDate, today: CalendarDate, step: i64) -> CalendarDate {
    let mut next = due.add_days(step);
    if next <= today {
        let behind = next.days_until(today.add_days(1));
        let steps = (behind + step - 1) / step;
        next = next.add_days(steps * step);
    }
    next
}

/// Próximo dia marcado depois de `from`: ainda na mesma semana (domingo a
/// sábado) ou, se não houver, na primeira semana válida `interval` semanas depois.
fn next_weekday(from: CalendarDate, weekdays: &[Weekday], interval: i64) -> CalendarDate {
    let current = from.weekday();
    if let Some(day) = weekdays.iter().find(|day| **day > current) {
        return from.add_days(i64::from(*day - current));
    }
    let week_start = from.add_days(-i64::from(current));
    let first = weekdays.first().copied().unwrap_or(current);
    week_start.add_days(interval * 7 + i64::from(first))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(value: &str) -> CalendarDate {
        CalendarDate::parse(value).unwrap()
    }

    fn rule(frequency: RecurrenceFrequency, interval: u32, weekdays: &[Weekday]) -> Recurrence {
        Recurrence {
            frequency,
            interval,
            weekdays: weekdays.to_vec(),
        }
    }

    fn next(rule: &Recurrence, due: &str, today: &str) -> String {
        rule.next_occurrence(date(due), date(today)).to_string()
    }

    use RecurrenceFrequency::{Daily, Monthly, Weekly, Yearly};

    #[test]
    fn validates_and_normalizes() {
        assert!(rule(Daily, 0, &[]).validate().is_err());
        assert!(rule(Daily, MAX_INTERVAL + 1, &[]).validate().is_err());
        assert!(rule(Weekly, 1, &[7]).validate().is_err());
        assert_eq!(
            rule(Weekly, 1, &[5, 1, 5]).validate().unwrap().weekdays,
            vec![1, 5]
        );
        assert!(rule(Monthly, 1, &[1])
            .validate()
            .unwrap()
            .weekdays
            .is_empty());
    }

    #[test]
    fn daily_and_simple_weekly() {
        assert_eq!(
            next(&rule(Daily, 1, &[]), "2026-09-25", "2026-09-25"),
            "2026-09-26"
        );
        assert_eq!(
            next(&rule(Daily, 3, &[]), "2026-09-25", "2026-09-01"),
            "2026-09-28"
        );
        assert_eq!(
            next(&rule(Weekly, 2, &[]), "2026-09-25", "2026-09-25"),
            "2026-10-09"
        );
    }

    #[test]
    fn late_completion_skips_past_occurrences() {
        // Diária vencida há 10 dias, concluída hoje: a próxima é amanhã.
        assert_eq!(
            next(&rule(Daily, 1, &[]), "2026-09-15", "2026-09-25"),
            "2026-09-26"
        );
        // A cada 3 dias mantém o ritmo original: 15, 18, 21, 24, 27.
        assert_eq!(
            next(&rule(Daily, 3, &[]), "2026-09-15", "2026-09-25"),
            "2026-09-27"
        );
        assert_eq!(
            next(&rule(Monthly, 1, &[]), "2026-07-10", "2026-09-25"),
            "2026-10-10"
        );
    }

    #[test]
    fn weekly_on_chosen_weekdays() {
        let mon_wed_fri = rule(Weekly, 1, &[1, 3, 5]);
        // 2026-09-21 é segunda.
        assert_eq!(next(&mon_wed_fri, "2026-09-21", "2026-09-21"), "2026-09-23");
        assert_eq!(next(&mon_wed_fri, "2026-09-25", "2026-09-25"), "2026-09-28");

        // A cada 2 semanas, às terças: pula a semana seguinte.
        let biweekly_tuesday = rule(Weekly, 2, &[2]);
        assert_eq!(
            next(&biweekly_tuesday, "2026-09-22", "2026-09-22"),
            "2026-10-06"
        );
    }

    #[test]
    fn monthly_and_yearly_clamp_to_month_end() {
        let monthly = rule(Monthly, 1, &[]);
        assert_eq!(next(&monthly, "2026-01-31", "2026-01-31"), "2026-02-28");
        assert_eq!(next(&monthly, "2026-01-31", "2026-03-01"), "2026-03-31");
        assert_eq!(
            next(&rule(Yearly, 1, &[]), "2024-02-29", "2024-02-29"),
            "2025-02-28"
        );
        assert_eq!(
            next(&rule(Monthly, 6, &[]), "2026-09-25", "2026-09-25"),
            "2027-03-25"
        );
    }

    #[test]
    fn serializes_as_camel_case_json() {
        let json = serde_json::to_value(rule(Weekly, 2, &[1])).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "frequency": "weekly", "interval": 2, "weekdays": [1] })
        );
        let parsed: Recurrence = serde_json::from_str(r#"{ "frequency": "daily" }"#).unwrap();
        assert_eq!(parsed, rule(Daily, 1, &[]));
    }
}
