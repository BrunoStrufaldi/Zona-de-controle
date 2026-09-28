//! Eventos do calendário: contratos, validação, expansão da recorrência (com
//! exceções por ocorrência) e cálculo dos lembretes.
//! Espelhado em `src/features/productivity/calendar/types.ts`.
//!
//! Uma série recorrente guarda só a regra; as ocorrências são calculadas para
//! o intervalo pedido. Cada ocorrência é identificada pela data original
//! (`occurrence_date`). Uma exceção cancela a ocorrência ou substitui os dados
//! dela (inclusive a data).

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::domain::calendar::{CalendarDate, LocalDateTime, TimeOfDay, Weekday};
use crate::domain::task_categories::CategoryColor;
use crate::domain::task_recurrence::RecurrenceFrequency;
use crate::domain::tasks::{TaskPriority, TaskStatus};
use crate::error::{AppError, AppResult};

pub const MAX_TITLE_CHARS: usize = 120;
pub const MAX_DESCRIPTION_CHARS: usize = 4000;
pub const MAX_LOCATION_CHARS: usize = 200;
/// Duração máxima de um evento (em dias entre início e fim).
pub const MAX_DURATION_DAYS: i64 = 366;
/// Lembrete com até 4 semanas de antecedência.
pub const MAX_REMINDER_MINUTES: u32 = 40_320;
pub const MAX_INTERVAL: u32 = 99;
pub const MAX_COUNT: u32 = 999;
/// Maior intervalo consultável de uma vez (a visão mensal usa 42 dias).
pub const MAX_RANGE_DAYS: i64 = 100;
/// Horário de referência do lembrete de eventos de dia inteiro.
pub const ALL_DAY_REMINDER_TIME: &str = "09:00";
/// Lembretes atrasados até este limite ainda são avisados (ex.: após suspender o PC).
pub const REMINDER_GRACE_MINUTES: i64 = 15;

// ---- Recorrência -------------------------------------------------------------

/// Regra de repetição: a cada `interval` dias/semanas/meses/anos. Na semanal,
/// `weekdays` (0 = domingo) escolhe os dias; vazio = mesmo dia da semana do
/// início. Termina, opcionalmente, em `until` (inclusive) ou após `count` ocorrências.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventRecurrence {
    pub frequency: RecurrenceFrequency,
    #[serde(default = "default_interval")]
    pub interval: u32,
    #[serde(default)]
    pub weekdays: Vec<Weekday>,
    #[serde(default)]
    pub until: Option<String>,
    #[serde(default)]
    pub count: Option<u32>,
}

fn default_interval() -> u32 {
    1
}

impl EventRecurrence {
    /// Valida e normaliza (dias ordenados, sem duplicatas; descartados fora da semanal).
    pub fn validate(mut self, start: CalendarDate) -> AppResult<Self> {
        if !(1..=MAX_INTERVAL).contains(&self.interval) {
            return Err(AppError::Validation(format!(
                "o intervalo da repetição deve estar entre 1 e {MAX_INTERVAL}"
            )));
        }
        if self.weekdays.iter().any(|day| *day > 6) {
            return Err(AppError::Validation(
                "dia da semana inválido na repetição".into(),
            ));
        }
        if self.frequency == RecurrenceFrequency::Weekly {
            self.weekdays.sort_unstable();
            self.weekdays.dedup();
        } else {
            self.weekdays.clear();
        }
        if self.until.is_some() && self.count.is_some() {
            return Err(AppError::Validation(
                "a repetição termina por data ou por número de vezes, não pelos dois".into(),
            ));
        }
        if let Some(until) = &self.until {
            let until = parse_date(until, "data final da repetição")?;
            if until < start {
                return Err(AppError::Validation(
                    "a repetição não pode terminar antes do início do evento".into(),
                ));
            }
        }
        if self
            .count
            .is_some_and(|count| !(1..=MAX_COUNT).contains(&count))
        {
            return Err(AppError::Validation(format!(
                "o número de repetições deve estar entre 1 e {MAX_COUNT}"
            )));
        }
        Ok(self)
    }

    /// Datas de início das ocorrências, em ordem, a partir de `start`.
    pub fn dates(&self, start: CalendarDate) -> RecurrenceDates<'_> {
        RecurrenceDates {
            rule: self,
            start,
            until: self.until.as_deref().and_then(CalendarDate::parse),
            remaining: self.count,
            period: 0,
            weekday_index: 0,
        }
    }
}

/// Iterador das datas de uma regra (termina em `until`/`count`, ou no ano 9999).
pub struct RecurrenceDates<'a> {
    rule: &'a EventRecurrence,
    start: CalendarDate,
    until: Option<CalendarDate>,
    remaining: Option<u32>,
    period: i64,
    weekday_index: usize,
}

impl Iterator for RecurrenceDates<'_> {
    type Item = CalendarDate;

    fn next(&mut self) -> Option<CalendarDate> {
        let interval = i64::from(self.rule.interval);
        let candidate = loop {
            let candidate = match self.rule.frequency {
                RecurrenceFrequency::Daily => self.start.add_days(self.period * interval),
                RecurrenceFrequency::Weekly if self.rule.weekdays.is_empty() => {
                    self.start.add_days(self.period * interval * 7)
                }
                RecurrenceFrequency::Weekly => {
                    let week_start = self.start.add_days(-i64::from(self.start.weekday()));
                    let day = self.rule.weekdays[self.weekday_index];
                    let candidate =
                        week_start.add_days(self.period * interval * 7 + i64::from(day));
                    self.weekday_index += 1;
                    if self.weekday_index == self.rule.weekdays.len() {
                        self.weekday_index = 0;
                        self.period += 1;
                    }
                    if candidate < self.start {
                        continue;
                    }
                    break candidate;
                }
                RecurrenceFrequency::Monthly => self
                    .start
                    .add_months(self.period * interval, self.start.day()),
                RecurrenceFrequency::Yearly => self
                    .start
                    .add_months(self.period * interval * 12, self.start.day()),
            };
            self.period += 1;
            break candidate;
        };

        if candidate.year() > 9999 || self.until.is_some_and(|until| candidate > until) {
            return None;
        }
        if let Some(remaining) = self.remaining.as_mut() {
            if *remaining == 0 {
                return None;
            }
            *remaining -= 1;
        }
        Some(candidate)
    }
}

// ---- Dados de um evento ------------------------------------------------------

/// Campos de uma ocorrência (da série ou de uma exceção), já validados.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventDetails {
    pub title: String,
    pub description: String,
    pub location: String,
    pub all_day: bool,
    pub start_date: CalendarDate,
    pub start_time: Option<TimeOfDay>,
    pub end_date: CalendarDate,
    pub end_time: Option<TimeOfDay>,
    pub reminder_minutes: Option<u32>,
}

impl EventDetails {
    /// Mesma ocorrência começando em `date` (mantém horários e duração).
    pub fn shifted_to(&self, date: CalendarDate) -> Self {
        let duration = self.start_date.days_until(self.end_date);
        Self {
            start_date: date,
            end_date: date.add_days(duration),
            ..self.clone()
        }
    }

    pub fn overlaps(&self, from: CalendarDate, to: CalendarDate) -> bool {
        self.start_date <= to && self.end_date >= from
    }

    /// Instante do lembrete (dia inteiro: antes das 09:00 do primeiro dia).
    pub fn reminder_at(&self) -> Option<LocalDateTime> {
        let minutes = self.reminder_minutes?;
        let time = self
            .start_time
            .or_else(|| TimeOfDay::parse(ALL_DAY_REMINDER_TIME))?;
        let start = LocalDateTime {
            date: self.start_date,
            time,
        };
        Some(start.add_minutes(-i64::from(minutes)))
    }
}

/// Dados de uma ocorrência vindos do formulário ("só esta ocorrência").
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OccurrenceInput {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub location: String,
    pub all_day: bool,
    pub start_date: String,
    #[serde(default)]
    pub start_time: Option<String>,
    pub end_date: String,
    #[serde(default)]
    pub end_time: Option<String>,
    #[serde(default)]
    pub reminder_minutes: Option<u32>,
}

impl OccurrenceInput {
    pub fn validate(self) -> AppResult<EventDetails> {
        let title = self.title.trim().to_string();
        if title.is_empty() {
            return Err(AppError::Validation(
                "o título do evento é obrigatório".into(),
            ));
        }
        if title.chars().count() > MAX_TITLE_CHARS {
            return Err(AppError::Validation(format!(
                "o título pode ter no máximo {MAX_TITLE_CHARS} caracteres"
            )));
        }
        let description = self.description.trim().to_string();
        if description.chars().count() > MAX_DESCRIPTION_CHARS {
            return Err(AppError::Validation(format!(
                "a descrição pode ter no máximo {MAX_DESCRIPTION_CHARS} caracteres"
            )));
        }
        let location = self.location.trim().to_string();
        if location.chars().count() > MAX_LOCATION_CHARS {
            return Err(AppError::Validation(format!(
                "o local pode ter no máximo {MAX_LOCATION_CHARS} caracteres"
            )));
        }

        let start_date = parse_date(&self.start_date, "data de início")?;
        let end_date = parse_date(&self.end_date, "data de término")?;
        let (start_time, end_time) = if self.all_day {
            (None, None)
        } else {
            let time = |value: Option<&str>, label: &str| -> AppResult<TimeOfDay> {
                value.and_then(TimeOfDay::parse).ok_or_else(|| {
                    AppError::Validation(format!("informe um horário de {label} válido"))
                })
            };
            (
                Some(time(self.start_time.as_deref(), "início")?),
                Some(time(self.end_time.as_deref(), "término")?),
            )
        };
        if (end_date, end_time) < (start_date, start_time) {
            return Err(AppError::Validation(
                "o término não pode ser antes do início".into(),
            ));
        }
        if start_date.days_until(end_date) > MAX_DURATION_DAYS {
            return Err(AppError::Validation(format!(
                "um evento pode durar no máximo {MAX_DURATION_DAYS} dias"
            )));
        }
        if self
            .reminder_minutes
            .is_some_and(|minutes| minutes > MAX_REMINDER_MINUTES)
        {
            return Err(AppError::Validation(
                "o lembrete pode ser de no máximo 4 semanas antes".into(),
            ));
        }

        Ok(EventDetails {
            title,
            description,
            location,
            all_day: self.all_day,
            start_date,
            start_time,
            end_date,
            end_time,
            reminder_minutes: self.reminder_minutes,
        })
    }
}

/// Dados da série (criação e edição de "toda a série").
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventInput {
    #[serde(flatten)]
    pub details: OccurrenceInput,
    pub color: CategoryColor,
    #[serde(default)]
    pub recurrence: Option<EventRecurrence>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidEvent {
    pub details: EventDetails,
    pub color: CategoryColor,
    pub recurrence: Option<EventRecurrence>,
}

impl EventInput {
    pub fn validate(self) -> AppResult<ValidEvent> {
        let details = self.details.validate()?;
        let recurrence = self
            .recurrence
            .map(|rule| rule.validate(details.start_date))
            .transpose()?;
        Ok(ValidEvent {
            details,
            color: self.color,
            recurrence,
        })
    }
}

fn parse_date(value: &str, label: &str) -> AppResult<CalendarDate> {
    CalendarDate::parse(value).ok_or_else(|| AppError::Validation(format!("{label} inválida")))
}

// ---- Série e ocorrências -----------------------------------------------------

/// Evento como está no banco, com as exceções (`None` = ocorrência cancelada).
#[derive(Debug, Clone, PartialEq)]
pub struct Series {
    pub id: i64,
    pub color: CategoryColor,
    pub details: EventDetails,
    pub recurrence: Option<EventRecurrence>,
    pub exceptions: HashMap<CalendarDate, Option<EventDetails>>,
    pub created_at: String,
    pub updated_at: String,
}

/// Ocorrência calculada.
#[derive(Debug, Clone, PartialEq)]
pub struct Occurrence {
    /// Data original na série (identifica a ocorrência).
    pub occurrence_date: CalendarDate,
    pub details: EventDetails,
    /// Alterada individualmente (exceção).
    pub modified: bool,
}

impl Series {
    /// `date` é uma ocorrência da série (pela regra, cancelada ou não)?
    pub fn is_rule_date(&self, date: CalendarDate) -> bool {
        match &self.recurrence {
            None => date == self.details.start_date,
            Some(rule) => rule
                .dates(self.details.start_date)
                .take_while(|candidate| *candidate <= date)
                .any(|candidate| candidate == date),
        }
    }

    pub fn is_cancelled(&self, date: CalendarDate) -> bool {
        matches!(self.exceptions.get(&date), Some(None))
    }

    /// Ocorrências que tocam o intervalo `[from, to]`, na ordem de início.
    pub fn occurrences(&self, from: CalendarDate, to: CalendarDate) -> Vec<Occurrence> {
        let Some(rule) = &self.recurrence else {
            return if self.details.overlaps(from, to) {
                vec![Occurrence {
                    occurrence_date: self.details.start_date,
                    details: self.details.clone(),
                    modified: false,
                }]
            } else {
                Vec::new()
            };
        };

        let duration = self.details.start_date.days_until(self.details.end_date);
        let mut occurrences: Vec<Occurrence> = rule
            .dates(self.details.start_date)
            .take_while(|date| *date <= to)
            .filter(|date| date.add_days(duration) >= from && !self.exceptions.contains_key(date))
            .map(|date| Occurrence {
                occurrence_date: date,
                details: self.details.shifted_to(date),
                modified: false,
            })
            .collect();
        occurrences.extend(self.exceptions.iter().filter_map(|(date, details)| {
            let details = details.as_ref()?;
            details.overlaps(from, to).then(|| Occurrence {
                occurrence_date: *date,
                details: details.clone(),
                modified: true,
            })
        }));
        occurrences.sort_by_key(|occurrence| {
            (
                occurrence.details.start_date,
                occurrence.details.start_time,
                occurrence.occurrence_date,
            )
        });
        occurrences
    }

    pub fn to_event(&self) -> CalendarEvent {
        let details = &self.details;
        CalendarEvent {
            id: self.id,
            title: details.title.clone(),
            description: details.description.clone(),
            location: details.location.clone(),
            color: self.color,
            all_day: details.all_day,
            start_date: details.start_date.to_string(),
            start_time: details.start_time.map(|time| time.to_string()),
            end_date: details.end_date.to_string(),
            end_time: details.end_time.map(|time| time.to_string()),
            reminder_minutes: details.reminder_minutes,
            recurrence: self.recurrence.clone(),
            exceptions: self.exceptions.len() as u32,
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
        }
    }

    pub fn to_occurrence(&self, occurrence: &Occurrence) -> EventOccurrence {
        let details = &occurrence.details;
        EventOccurrence {
            event_id: self.id,
            occurrence_date: occurrence.occurrence_date.to_string(),
            title: details.title.clone(),
            description: details.description.clone(),
            location: details.location.clone(),
            color: self.color,
            all_day: details.all_day,
            start_date: details.start_date.to_string(),
            start_time: details.start_time.map(|time| time.to_string()),
            end_date: details.end_date.to_string(),
            end_time: details.end_time.map(|time| time.to_string()),
            reminder_minutes: details.reminder_minutes,
            recurring: self.recurrence.is_some(),
            modified: occurrence.modified,
        }
    }
}

/// Lembretes cujo instante está entre `now - REMINDER_GRACE_MINUTES` e `now`.
pub fn due_reminders(series: &[Series], now: LocalDateTime) -> Vec<DueReminder> {
    let earliest = now.add_minutes(-REMINDER_GRACE_MINUTES);
    let from = earliest.date;
    let to = now
        .add_minutes(i64::from(MAX_REMINDER_MINUTES) + REMINDER_GRACE_MINUTES)
        .date;
    let mut due: Vec<DueReminder> = series
        .iter()
        .flat_map(|event| {
            event
                .occurrences(from, to)
                .into_iter()
                .filter_map(move |occurrence| {
                    let remind_at = occurrence.details.reminder_at()?;
                    (earliest..=now).contains(&remind_at).then(|| DueReminder {
                        event_id: event.id,
                        occurrence_date: occurrence.occurrence_date.to_string(),
                        title: occurrence.details.title.clone(),
                        location: occurrence.details.location.clone(),
                        all_day: occurrence.details.all_day,
                        start_date: occurrence.details.start_date.to_string(),
                        start_time: occurrence.details.start_time.map(|time| time.to_string()),
                        remind_at: remind_at.to_string(),
                    })
                })
        })
        .collect();
    due.sort_by(|a, b| a.remind_at.cmp(&b.remind_at));
    due
}

// ---- Contrato com o frontend ---------------------------------------------------

/// Série (dados base usados em "editar toda a série").
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: i64,
    pub title: String,
    pub description: String,
    pub location: String,
    pub color: CategoryColor,
    pub all_day: bool,
    pub start_date: String,
    pub start_time: Option<String>,
    pub end_date: String,
    pub end_time: Option<String>,
    pub reminder_minutes: Option<u32>,
    pub recurrence: Option<EventRecurrence>,
    /// Ocorrências alteradas ou excluídas individualmente.
    pub exceptions: u32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventOccurrence {
    pub event_id: i64,
    pub occurrence_date: String,
    pub title: String,
    pub description: String,
    pub location: String,
    pub color: CategoryColor,
    pub all_day: bool,
    pub start_date: String,
    pub start_time: Option<String>,
    pub end_date: String,
    pub end_time: Option<String>,
    pub reminder_minutes: Option<u32>,
    pub recurring: bool,
    pub modified: bool,
}

/// Tarefa com vencimento no intervalo (exibida no calendário, somente leitura).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarTask {
    pub id: i64,
    pub title: String,
    pub due_date: String,
    pub status: TaskStatus,
    pub priority: TaskPriority,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarAgenda {
    /// Séries com alguma ocorrência no intervalo.
    pub events: Vec<CalendarEvent>,
    pub occurrences: Vec<EventOccurrence>,
    pub tasks: Vec<CalendarTask>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DueReminder {
    pub event_id: i64,
    pub occurrence_date: String,
    pub title: String,
    pub location: String,
    pub all_day: bool,
    pub start_date: String,
    pub start_time: Option<String>,
    /// `aaaa-mm-ddTHH:MM` local.
    pub remind_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use RecurrenceFrequency::{Daily, Monthly, Weekly, Yearly};

    fn date(value: &str) -> CalendarDate {
        CalendarDate::parse(value).unwrap()
    }

    fn at(value: &str) -> LocalDateTime {
        LocalDateTime::parse(value).unwrap()
    }

    fn rule(
        frequency: RecurrenceFrequency,
        interval: u32,
        weekdays: &[Weekday],
    ) -> EventRecurrence {
        EventRecurrence {
            frequency,
            interval,
            weekdays: weekdays.to_vec(),
            until: None,
            count: None,
        }
    }

    fn first_dates(rule: &EventRecurrence, start: &str, n: usize) -> Vec<String> {
        rule.dates(date(start))
            .take(n)
            .map(|date| date.to_string())
            .collect()
    }

    fn input(start: &str, end: &str, times: Option<(&str, &str)>) -> OccurrenceInput {
        OccurrenceInput {
            title: " Reunião ".into(),
            description: String::new(),
            location: String::new(),
            all_day: times.is_none(),
            start_date: start.into(),
            start_time: times.map(|(start, _)| start.into()),
            end_date: end.into(),
            end_time: times.map(|(_, end)| end.into()),
            reminder_minutes: None,
        }
    }

    fn series(
        start: &str,
        times: Option<(&str, &str)>,
        recurrence: Option<EventRecurrence>,
    ) -> Series {
        Series {
            id: 1,
            color: CategoryColor::Blue,
            details: input(start, start, times).validate().unwrap(),
            recurrence,
            exceptions: HashMap::new(),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn dates_of(occurrences: &[Occurrence]) -> Vec<String> {
        occurrences
            .iter()
            .map(|occurrence| occurrence.details.start_date.to_string())
            .collect()
    }

    #[test]
    fn validates_event_fields() {
        let details = input("2026-09-25", "2026-09-25", Some(("14:00", "15:30")))
            .validate()
            .unwrap();
        assert_eq!(details.title, "Reunião");
        assert_eq!(details.start_time.unwrap().to_string(), "14:00");

        // Dia inteiro descarta horários.
        let mut all_day = input("2026-09-25", "2026-09-27", Some(("14:00", "15:00")));
        all_day.all_day = true;
        let all_day = all_day.validate().unwrap();
        assert_eq!((all_day.start_time, all_day.end_time), (None, None));

        let invalid = [
            input("2026-09-25", "2026-09-25", Some(("15:00", "14:00"))),
            input("2026-09-26", "2026-09-25", None),
            input("2026-09-25", "2026-09-25", Some(("14:00", "25:00"))),
            input("25/09/2026", "2026-09-25", None),
            input("2026-01-01", "2027-06-01", None),
            OccurrenceInput {
                title: "  ".into(),
                ..input("2026-09-25", "2026-09-25", None)
            },
            OccurrenceInput {
                reminder_minutes: Some(MAX_REMINDER_MINUTES + 1),
                ..input("2026-09-25", "2026-09-25", None)
            },
        ];
        for (index, case) in invalid.into_iter().enumerate() {
            assert!(case.validate().is_err(), "caso {index}");
        }
        // Mesmo horário de início e fim é permitido (evento pontual).
        assert!(input("2026-09-25", "2026-09-25", Some(("14:00", "14:00")))
            .validate()
            .is_ok());
    }

    #[test]
    fn validates_recurrence() {
        let start = date("2026-09-25");
        assert!(rule(Daily, 0, &[]).validate(start).is_err());
        assert!(rule(Weekly, 1, &[7]).validate(start).is_err());
        assert_eq!(
            rule(Weekly, 1, &[5, 1, 5])
                .validate(start)
                .unwrap()
                .weekdays,
            vec![1, 5]
        );
        assert!(rule(Monthly, 1, &[1])
            .validate(start)
            .unwrap()
            .weekdays
            .is_empty());

        let mut both = rule(Daily, 1, &[]);
        both.until = Some("2026-10-01".into());
        both.count = Some(3);
        assert!(both.clone().validate(start).is_err());
        both.count = None;
        assert!(both.clone().validate(start).is_ok());
        both.until = Some("2026-09-24".into());
        assert!(both.validate(start).is_err());

        let mut count = rule(Daily, 1, &[]);
        count.count = Some(0);
        assert!(count.validate(start).is_err());
    }

    #[test]
    fn generates_dates_for_each_frequency() {
        assert_eq!(
            first_dates(&rule(Daily, 2, &[]), "2026-09-29", 3),
            ["2026-09-29", "2026-10-01", "2026-10-03"]
        );
        // Sexta, mesma semana sem dias escolhidos.
        assert_eq!(
            first_dates(&rule(Weekly, 1, &[]), "2026-09-25", 2),
            ["2026-09-25", "2026-10-02"]
        );
        // Seg/qua a cada 2 semanas, começando numa quarta: a segunda anterior não conta.
        assert_eq!(
            first_dates(&rule(Weekly, 2, &[1, 3]), "2026-09-23", 4),
            ["2026-09-23", "2026-10-05", "2026-10-07", "2026-10-19"]
        );
        // Dia 31: meses mais curtos usam o último dia, sem "escorregar".
        assert_eq!(
            first_dates(&rule(Monthly, 1, &[]), "2026-01-31", 3),
            ["2026-01-31", "2026-02-28", "2026-03-31"]
        );
        assert_eq!(
            first_dates(&rule(Yearly, 1, &[]), "2024-02-29", 2),
            ["2024-02-29", "2025-02-28"]
        );
    }

    #[test]
    fn stops_at_until_or_count() {
        let mut until = rule(Daily, 1, &[]);
        until.until = Some("2026-09-27".into());
        assert_eq!(first_dates(&until, "2026-09-25", 10).len(), 3);

        let mut count = rule(Weekly, 1, &[1, 3, 5]);
        count.count = Some(4);
        assert_eq!(
            first_dates(&count, "2026-09-25", 10),
            ["2026-09-25", "2026-09-28", "2026-09-30", "2026-10-02"]
        );
    }

    #[test]
    fn expands_occurrences_in_a_range() {
        let weekly = series(
            "2026-09-01",
            Some(("09:00", "10:00")),
            Some(rule(Weekly, 1, &[])),
        );
        let found = weekly.occurrences(date("2026-09-10"), date("2026-09-30"));
        assert_eq!(dates_of(&found), ["2026-09-15", "2026-09-22", "2026-09-29"]);
        assert!(weekly.is_rule_date(date("2026-09-08")));
        assert!(!weekly.is_rule_date(date("2026-09-09")));

        // Evento de vários dias aparece se qualquer dia tocar o intervalo.
        let mut trip = series("2026-09-20", None, None);
        trip.details.end_date = date("2026-09-23");
        assert_eq!(
            trip.occurrences(date("2026-09-23"), date("2026-09-30"))
                .len(),
            1
        );
        assert!(trip
            .occurrences(date("2026-09-24"), date("2026-09-30"))
            .is_empty());

        let mut multi_day = trip.clone();
        multi_day.recurrence = Some(rule(Weekly, 1, &[]));
        // A ocorrência de 20/09 (até 23/09) ainda toca o dia 22.
        assert_eq!(
            dates_of(&multi_day.occurrences(date("2026-09-22"), date("2026-09-28"))),
            ["2026-09-20", "2026-09-27"]
        );
    }

    #[test]
    fn applies_cancelled_and_modified_exceptions() {
        let mut daily = series(
            "2026-09-21",
            Some(("08:00", "08:30")),
            Some(rule(Daily, 1, &[])),
        );
        daily.exceptions.insert(date("2026-09-22"), None);
        let mut moved = daily.details.shifted_to(date("2026-09-23"));
        moved.title = "Mudou".into();
        moved.start_date = date("2026-09-30");
        moved.end_date = date("2026-09-30");
        daily.exceptions.insert(date("2026-09-23"), Some(moved));

        let found = daily.occurrences(date("2026-09-21"), date("2026-09-24"));
        assert_eq!(dates_of(&found), ["2026-09-21", "2026-09-24"]);
        assert!(daily.is_cancelled(date("2026-09-22")));

        // A ocorrência movida aparece no novo dia, com a data original como chave.
        let later = daily.occurrences(date("2026-09-30"), date("2026-09-30"));
        assert_eq!(later.len(), 2);
        let modified = later.iter().find(|occurrence| occurrence.modified).unwrap();
        assert_eq!(modified.occurrence_date, date("2026-09-23"));
        assert_eq!(modified.details.title, "Mudou");
    }

    #[test]
    fn computes_reminder_instants() {
        let mut timed = input("2026-09-25", "2026-09-25", Some(("14:00", "15:00")))
            .validate()
            .unwrap();
        assert_eq!(timed.reminder_at(), None);
        timed.reminder_minutes = Some(30);
        assert_eq!(timed.reminder_at(), Some(at("2026-09-25T13:30")));

        let mut all_day = input("2026-09-25", "2026-09-25", None).validate().unwrap();
        all_day.reminder_minutes = Some(24 * 60);
        assert_eq!(all_day.reminder_at(), Some(at("2026-09-24T09:00")));
    }

    #[test]
    fn finds_due_reminders_within_the_grace_window() {
        let mut daily = series(
            "2026-09-20",
            Some(("10:00", "11:00")),
            Some(rule(Daily, 1, &[])),
        );
        daily.details.reminder_minutes = Some(10);
        let list = [daily];

        let due = due_reminders(&list, at("2026-09-25T09:50"));
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].occurrence_date, "2026-09-25");
        assert_eq!(due[0].remind_at, "2026-09-25T09:50");
        // Ainda vale 15 minutos depois; mais que isso, não.
        assert_eq!(due_reminders(&list, at("2026-09-25T10:05")).len(), 1);
        assert!(due_reminders(&list, at("2026-09-25T10:06")).is_empty());
        assert!(due_reminders(&list, at("2026-09-25T09:49")).is_empty());
    }
}
