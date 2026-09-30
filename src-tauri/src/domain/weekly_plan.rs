//! Planejamento semanal fixo: blocos que se repetem nos mesmos dias toda
//! semana (ex.: "Trabalho HomeOffice", seg/qua/sex, 08:00–15:00). É só um
//! plano: nada é marcado como feito. Espelhado em
//! `src/features/productivity/weekly-plan/types.ts`.

use serde::{Deserialize, Serialize};

use crate::domain::calendar::{TimeOfDay, Weekday};
use crate::domain::routines::Weekdays;
use crate::domain::task_categories::CategoryColor;
use crate::error::{AppError, AppResult};

pub const MAX_TITLE_CHARS: usize = 80;
pub const MAX_NOTES_CHARS: usize = 500;
pub const MAX_BLOCKS: usize = 200;

/// Nomes para as mensagens (índice = `Weekday`, 0 = domingo).
const WEEKDAY_NAMES: [&str; 7] = [
    "no domingo",
    "na segunda",
    "na terça",
    "na quarta",
    "na quinta",
    "na sexta",
    "no sábado",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanBlockInput {
    pub title: String,
    #[serde(default)]
    pub notes: String,
    pub weekdays: Vec<Weekday>,
    /// `HH:MM`; sem início e fim, o bloco é uma anotação do dia inteiro.
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub color: CategoryColor,
}

/// Horário de um bloco: `start` < `end`, no mesmo dia.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TimeSpan {
    pub start: TimeOfDay,
    pub end: TimeOfDay,
}

impl TimeSpan {
    fn overlaps(self, other: TimeSpan) -> bool {
        self.start < other.end && other.start < self.end
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidBlock {
    pub title: String,
    pub notes: String,
    pub weekdays: Weekdays,
    /// `None` = dia inteiro.
    pub span: Option<TimeSpan>,
    pub color: CategoryColor,
}

fn collapse_spaces(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn parse_time(value: &str, label: &str) -> AppResult<TimeOfDay> {
    TimeOfDay::parse(value.trim())
        .ok_or_else(|| AppError::Validation(format!("{label} inválido: use HH:MM")))
}

impl PlanBlockInput {
    pub fn validate(self) -> AppResult<ValidBlock> {
        let title = collapse_spaces(&self.title);
        if title.is_empty() {
            return Err(AppError::Validation(
                "o título do bloco é obrigatório".into(),
            ));
        }
        if title.chars().count() > MAX_TITLE_CHARS {
            return Err(AppError::Validation(format!(
                "o título pode ter no máximo {MAX_TITLE_CHARS} caracteres"
            )));
        }
        let notes = self.notes.trim().to_owned();
        if notes.chars().count() > MAX_NOTES_CHARS {
            return Err(AppError::Validation(format!(
                "a observação pode ter no máximo {MAX_NOTES_CHARS} caracteres"
            )));
        }
        let span = match (self.start_time, self.end_time) {
            (None, None) => None,
            (Some(start), Some(end)) => {
                let span = TimeSpan {
                    start: parse_time(&start, "início")?,
                    end: parse_time(&end, "fim")?,
                };
                if span.start >= span.end {
                    return Err(AppError::Validation(
                        "o fim precisa ser depois do início (no mesmo dia)".into(),
                    ));
                }
                Some(span)
            }
            _ => {
                return Err(AppError::Validation(
                    "informe o início e o fim, ou marque o dia inteiro".into(),
                ))
            }
        };
        Ok(ValidBlock {
            title,
            notes,
            weekdays: Weekdays::from_list(&self.weekdays)?,
            span,
            color: self.color,
        })
    }
}

/// Bloco salvo, como vai para o frontend.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanBlock {
    pub id: i64,
    pub title: String,
    pub notes: String,
    pub weekdays: Vec<Weekday>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub color: CategoryColor,
}

impl PlanBlock {
    fn span(&self) -> Option<TimeSpan> {
        Some(TimeSpan {
            start: TimeOfDay::parse(self.start_time.as_deref()?)?,
            end: TimeOfDay::parse(self.end_time.as_deref()?)?,
        })
    }
}

/// Primeiro bloco com horário que se sobrepõe ao `candidate` num dia em comum
/// (anotações do dia inteiro nunca conflitam). `editing` é ignorado.
pub fn find_conflict<'a>(
    candidate: &ValidBlock,
    editing: Option<i64>,
    blocks: &'a [PlanBlock],
) -> Option<(&'a PlanBlock, Weekday)> {
    let span = candidate.span?;
    blocks
        .iter()
        .filter(|block| Some(block.id) != editing)
        .find_map(|block| {
            let other = block.span()?;
            if !span.overlaps(other) {
                return None;
            }
            let day = block
                .weekdays
                .iter()
                .copied()
                .find(|&day| candidate.weekdays.contains(day))?;
            Some((block, day))
        })
}

/// Mensagem do conflito em pt-BR.
pub fn conflict_message(block: &PlanBlock, day: Weekday) -> String {
    let when = WEEKDAY_NAMES.get(usize::from(day)).copied().unwrap_or("");
    format!(
        "o horário conflita com “{}” {when} ({}–{}); ajuste os horários ou os dias",
        block.title,
        block.start_time.as_deref().unwrap_or(""),
        block.end_time.as_deref().unwrap_or(""),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(title: &str, days: &[Weekday], span: Option<(&str, &str)>) -> PlanBlockInput {
        PlanBlockInput {
            title: title.into(),
            notes: String::new(),
            weekdays: days.to_vec(),
            start_time: span.map(|(start, _)| start.into()),
            end_time: span.map(|(_, end)| end.into()),
            color: CategoryColor::Blue,
        }
    }

    fn saved(id: i64, title: &str, days: &[Weekday], span: Option<(&str, &str)>) -> PlanBlock {
        PlanBlock {
            id,
            title: title.into(),
            notes: String::new(),
            weekdays: days.to_vec(),
            start_time: span.map(|(start, _)| start.into()),
            end_time: span.map(|(_, end)| end.into()),
            color: CategoryColor::Blue,
        }
    }

    #[test]
    fn validates_title_days_and_times() {
        let valid = input(
            "  Trabalho   HomeOffice ",
            &[1, 3, 5],
            Some(("08:00", "15:00")),
        )
        .validate()
        .unwrap();
        assert_eq!(valid.title, "Trabalho HomeOffice");
        assert_eq!(valid.weekdays.to_list(), [1, 3, 5]);
        assert!(valid.span.is_some());

        let day_note = input("Descanso", &[0], None).validate().unwrap();
        assert!(day_note.span.is_none());

        assert!(input(" ", &[1], None).validate().is_err());
        assert!(input("x", &[], None).validate().is_err());
        assert!(input("x", &[7], None).validate().is_err());
        assert!(input("x", &[1], Some(("15:00", "08:00")))
            .validate()
            .is_err());
        assert!(input("x", &[1], Some(("08:00", "08:00")))
            .validate()
            .is_err());
        assert!(input("x", &[1], Some(("8h", "09:00"))).validate().is_err());
        assert!(input("x", &[1], Some(("08:00", "24:00")))
            .validate()
            .is_err());
        let only_start = PlanBlockInput {
            end_time: None,
            ..input("x", &[1], Some(("08:00", "09:00")))
        };
        assert!(only_start.validate().is_err());
        let long = input(&"a".repeat(81), &[1], None);
        assert!(long.validate().is_err());
    }

    #[test]
    fn blocks_on_the_same_day_cannot_overlap() {
        let blocks = [
            saved(1, "Trabalho", &[1, 3, 5], Some(("08:00", "15:00"))),
            saved(2, "Academia", &[3], Some(("16:30", "18:00"))),
            saved(3, "Estudar", &[6], None),
        ];
        let check = |days: &[Weekday], span: Option<(&str, &str)>, editing: Option<i64>| {
            let block = input("Novo", days, span).validate().unwrap();
            find_conflict(&block, editing, &blocks).map(|(block, day)| (block.id, day))
        };

        // Encostar no fim de outro bloco não é conflito.
        assert_eq!(check(&[1, 3, 5], Some(("15:00", "15:30")), None), None);
        assert_eq!(check(&[3], Some(("14:30", "16:00")), None), Some((1, 3)));
        assert_eq!(check(&[2, 3], Some(("17:00", "17:30")), None), Some((2, 3)));
        // Dias diferentes e anotações do dia inteiro não conflitam.
        assert_eq!(check(&[2, 4], Some(("09:00", "10:00")), None), None);
        assert_eq!(check(&[6], Some(("09:00", "10:00")), None), None);
        assert_eq!(check(&[1], None, None), None);
        // O próprio bloco em edição fica de fora.
        assert_eq!(check(&[1, 3, 5], Some(("07:30", "15:00")), Some(1)), None);
    }

    #[test]
    fn explains_the_conflict() {
        let block = saved(2, "Academia", &[3], Some(("16:30", "18:00")));
        assert_eq!(
            conflict_message(&block, 3),
            "o horário conflita com “Academia” na quarta (16:30–18:00); ajuste os horários ou os dias"
        );
    }
}
