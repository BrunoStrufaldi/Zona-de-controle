//! Notas e diário: contratos com o frontend e validação.
//! Espelhado em `src/features/productivity/notes/types.ts`.

use serde::{Deserialize, Serialize};

use crate::domain::calendar::CalendarDate;
use crate::domain::tags::normalize_tags;
use crate::error::{AppError, AppResult};

pub const MAX_TITLE_CHARS: usize = 200;
pub const MAX_CONTENT_CHARS: usize = 200_000;
pub const MAX_FOLDER_NAME_CHARS: usize = 60;
pub const MAX_FOLDERS: usize = 100;
/// Versões guardadas por nota (as mais antigas saem primeiro).
pub const MAX_VERSIONS_PER_NOTE: usize = 20;
/// Intervalo mínimo entre duas versões automáticas da mesma nota.
pub const VERSION_INTERVAL_MINUTES: u32 = 5;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: i64,
    pub title: String,
    /// Markdown.
    pub content: String,
    pub folder_id: Option<i64>,
    pub favorite: bool,
    /// Entradas de diário: data local `aaaa-mm-dd` (uma nota por dia).
    pub journal_date: Option<String>,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Dados de criação/edição (substituição completa de título, conteúdo, pasta e
/// tags). `journal_date` só vale na criação; a data de um diário não muda.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInput {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub folder_id: Option<i64>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub journal_date: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidNote {
    pub title: String,
    pub content: String,
    pub folder_id: Option<i64>,
    pub tags: Vec<String>,
    pub journal_date: Option<String>,
}

impl NoteInput {
    pub fn validate(self) -> AppResult<ValidNote> {
        let title = self.title.trim().to_string();
        if title.chars().count() > MAX_TITLE_CHARS {
            return Err(AppError::Validation(format!(
                "o título pode ter no máximo {MAX_TITLE_CHARS} caracteres"
            )));
        }
        if self.content.chars().count() > MAX_CONTENT_CHARS {
            return Err(AppError::Validation(format!(
                "a nota pode ter no máximo {MAX_CONTENT_CHARS} caracteres"
            )));
        }
        let journal_date = match self.journal_date.as_deref().map(str::trim) {
            None | Some("") => None,
            Some(date) if CalendarDate::parse(date).is_some() => Some(date.to_string()),
            Some(date) => {
                return Err(AppError::Validation(format!(
                    "data de diário inválida: {date}"
                )))
            }
        };
        Ok(ValidNote {
            title,
            content: self.content,
            folder_id: self.folder_id,
            tags: normalize_tags(self.tags)?,
            journal_date,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteVersion {
    pub id: i64,
    pub note_id: i64,
    pub title: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteFolder {
    pub id: i64,
    pub name: String,
    pub note_count: u32,
}

/// Nome de pasta sem espaços nas pontas e com espaços internos colapsados.
pub fn validate_folder_name(raw: &str) -> AppResult<String> {
    let name = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        return Err(AppError::Validation("o nome da pasta é obrigatório".into()));
    }
    if name.chars().count() > MAX_FOLDER_NAME_CHARS {
        return Err(AppError::Validation(format!(
            "o nome da pasta pode ter no máximo {MAX_FOLDER_NAME_CHARS} caracteres"
        )));
    }
    Ok(name)
}

/// Rótulo legível para mensagens e auditoria.
pub fn display_title(title: &str, journal_date: Option<&str>) -> String {
    match (title.trim(), journal_date) {
        ("", Some(date)) => format!("Diário de {date}"),
        ("", None) => "Sem título".to_string(),
        (title, _) => title.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(title: &str) -> NoteInput {
        NoteInput {
            title: title.into(),
            content: "# Olá".into(),
            folder_id: None,
            tags: vec!["Ideias".into()],
            journal_date: None,
        }
    }

    #[test]
    fn validates_and_normalizes() {
        let valid = input("  Reunião  ").validate().unwrap();
        assert_eq!(valid.title, "Reunião");
        assert_eq!(valid.tags, vec!["ideias"]);
        // Título vazio é permitido.
        assert_eq!(input("").validate().unwrap().title, "");
        assert!(input(&"x".repeat(MAX_TITLE_CHARS + 1)).validate().is_err());

        let mut long = input("x");
        long.content = "a".repeat(MAX_CONTENT_CHARS + 1);
        assert!(long.validate().is_err());
    }

    #[test]
    fn validates_journal_dates() {
        let mut journal = input("");
        journal.journal_date = Some("2026-09-25".into());
        assert_eq!(
            journal.clone().validate().unwrap().journal_date.as_deref(),
            Some("2026-09-25")
        );
        journal.journal_date = Some("25/09/2026".into());
        assert!(journal.validate().is_err());
    }

    #[test]
    fn validates_folder_names_and_titles() {
        assert_eq!(
            validate_folder_name("  Estudos   2026 ").unwrap(),
            "Estudos 2026"
        );
        assert!(validate_folder_name("  ").is_err());
        assert_eq!(
            display_title("", Some("2026-09-25")),
            "Diário de 2026-09-25"
        );
        assert_eq!(display_title(" ", None), "Sem título");
        assert_eq!(display_title("Ideias", None), "Ideias");
    }
}
