//! Tarefas: tipos do contrato com o frontend e regras de validação.
//! Espelhado em `src/features/productivity/tasks/types.ts`.

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

pub const MAX_TITLE_CHARS: usize = 200;
pub const MAX_DESCRIPTION_CHARS: usize = 10_000;
pub const MAX_TAGS: usize = 10;
pub const MAX_TAG_CHARS: usize = 32;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Todo,
    InProgress,
    Done,
}

impl TaskStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Todo => "todo",
            Self::InProgress => "in_progress",
            Self::Done => "done",
        }
    }

    pub fn parse(value: &str) -> AppResult<Self> {
        match value {
            "todo" => Ok(Self::Todo),
            "in_progress" => Ok(Self::InProgress),
            "done" => Ok(Self::Done),
            other => Err(AppError::Validation(format!("status inválido: {other}"))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskPriority {
    Low,
    Medium,
    High,
    Urgent,
}

impl TaskPriority {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Urgent => "urgent",
        }
    }

    pub fn parse(value: &str) -> AppResult<Self> {
        match value {
            "low" => Ok(Self::Low),
            "medium" => Ok(Self::Medium),
            "high" => Ok(Self::High),
            "urgent" => Ok(Self::Urgent),
            other => Err(AppError::Validation(format!(
                "prioridade inválida: {other}"
            ))),
        }
    }
}

/// Tarefa como exposta ao frontend.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    /// Data local `aaaa-mm-dd`.
    pub due_date: Option<String>,
    pub position: f64,
    pub tags: Vec<String>,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Dados enviados pelo frontend para criar ou editar (substituição completa).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_status")]
    pub status: TaskStatus,
    #[serde(default = "default_priority")]
    pub priority: TaskPriority,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

fn default_status() -> TaskStatus {
    TaskStatus::Todo
}

fn default_priority() -> TaskPriority {
    TaskPriority::Medium
}

/// Entrada já validada e normalizada, pronta para persistir.
#[derive(Debug, Clone, PartialEq)]
pub struct ValidTask {
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub due_date: Option<String>,
    pub tags: Vec<String>,
}

impl TaskInput {
    pub fn validate(self) -> AppResult<ValidTask> {
        let title = self.title.trim().to_string();
        if title.is_empty() {
            return Err(AppError::Validation("o título é obrigatório".into()));
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

        let due_date = match self.due_date.as_deref().map(str::trim) {
            None | Some("") => None,
            Some(date) if is_valid_iso_date(date) => Some(date.to_string()),
            Some(date) => {
                return Err(AppError::Validation(format!(
                    "data de vencimento inválida: {date}"
                )))
            }
        };

        Ok(ValidTask {
            title,
            description,
            status: self.status,
            priority: self.priority,
            due_date,
            tags: normalize_tags(self.tags)?,
        })
    }
}

/// Tags: sem espaços nas pontas, espaços internos colapsados, minúsculas,
/// sem duplicatas (mantendo a ordem de entrada).
pub fn normalize_tags(raw: Vec<String>) -> AppResult<Vec<String>> {
    let mut tags: Vec<String> = Vec::new();
    for tag in raw {
        let normalized = tag
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase();
        if normalized.is_empty() || tags.contains(&normalized) {
            continue;
        }
        if normalized.chars().count() > MAX_TAG_CHARS {
            return Err(AppError::Validation(format!(
                "cada tag pode ter no máximo {MAX_TAG_CHARS} caracteres"
            )));
        }
        tags.push(normalized);
    }
    if tags.len() > MAX_TAGS {
        return Err(AppError::Validation(format!(
            "uma tarefa pode ter no máximo {MAX_TAGS} tags"
        )));
    }
    Ok(tags)
}

/// Valida `aaaa-mm-dd` com dia existente no mês (considera anos bissextos).
pub fn is_valid_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let parse = |range: std::ops::Range<usize>| -> Option<u32> {
        let part = &value[range];
        part.bytes()
            .all(|b| b.is_ascii_digit())
            .then(|| part.parse().ok())
            .flatten()
    };
    let (Some(year), Some(month), Some(day)) = (parse(0..4), parse(5..7), parse(8..10)) else {
        return false;
    };
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    year >= 1 && (1..=days_in_month).contains(&day)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(title: &str) -> TaskInput {
        TaskInput {
            title: title.into(),
            description: String::new(),
            status: TaskStatus::Todo,
            priority: TaskPriority::Medium,
            due_date: None,
            tags: Vec::new(),
        }
    }

    #[test]
    fn trims_and_requires_title() {
        assert_eq!(
            input("  Comprar pão  ").validate().unwrap().title,
            "Comprar pão"
        );
        assert!(input("   ").validate().is_err());
        assert!(input(&"x".repeat(MAX_TITLE_CHARS + 1)).validate().is_err());
    }

    #[test]
    fn normalizes_tags() {
        let tags = normalize_tags(vec![
            " Trabalho ".into(),
            "trabalho".into(),
            "casa  e   jardim".into(),
            "".into(),
        ])
        .unwrap();
        assert_eq!(tags, vec!["trabalho", "casa e jardim"]);

        let too_many = (0..=MAX_TAGS).map(|i| format!("t{i}")).collect();
        assert!(normalize_tags(too_many).is_err());
        assert!(normalize_tags(vec!["x".repeat(MAX_TAG_CHARS + 1)]).is_err());
    }

    #[test]
    fn validates_due_dates() {
        for valid in ["2026-09-25", "2024-02-29", "2026-12-31"] {
            assert!(is_valid_iso_date(valid), "{valid}");
        }
        for invalid in [
            "2026-02-29",
            "2026-13-01",
            "2026-04-31",
            "25/09/2026",
            "2026-9-25",
            "abcd-ef-gh",
        ] {
            assert!(!is_valid_iso_date(invalid), "{invalid}");
        }

        let mut with_date = input("x");
        with_date.due_date = Some("".into());
        assert_eq!(with_date.validate().unwrap().due_date, None);
    }

    #[test]
    fn deserializes_with_defaults() {
        let parsed: TaskInput =
            serde_json::from_str(r#"{ "title": "Ler", "dueDate": "2026-10-01" }"#).unwrap();
        assert_eq!(parsed.status, TaskStatus::Todo);
        assert_eq!(parsed.priority, TaskPriority::Medium);
        assert_eq!(parsed.due_date.as_deref(), Some("2026-10-01"));
        assert_eq!(
            serde_json::to_value(TaskStatus::InProgress).unwrap(),
            serde_json::json!("in_progress")
        );
    }
}
