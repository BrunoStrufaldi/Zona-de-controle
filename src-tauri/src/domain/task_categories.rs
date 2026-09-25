//! Categorias de tarefas, criadas pelo usuário (no máximo uma por tarefa).
//! Espelhado em `src/features/productivity/tasks/types.ts`.

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

pub const MAX_NAME_CHARS: usize = 40;
pub const MAX_CATEGORIES: usize = 50;

/// Cor da paleta de categorias. O frontend mapeia cada nome para um token do
/// tema (`--zdc-category-*`); o banco nunca guarda hexadecimal.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CategoryColor {
    Red,
    Orange,
    Amber,
    Green,
    Teal,
    Blue,
    Violet,
    Pink,
    Slate,
}

impl CategoryColor {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Red => "red",
            Self::Orange => "orange",
            Self::Amber => "amber",
            Self::Green => "green",
            Self::Teal => "teal",
            Self::Blue => "blue",
            Self::Violet => "violet",
            Self::Pink => "pink",
            Self::Slate => "slate",
        }
    }

    pub fn parse(value: &str) -> AppResult<Self> {
        serde_json::from_value(serde_json::Value::String(value.to_string()))
            .map_err(|_| AppError::Validation(format!("cor de categoria inválida: {value}")))
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCategory {
    pub id: i64,
    pub name: String,
    pub color: CategoryColor,
    /// Tarefas (inclusive arquivadas) que usam a categoria.
    pub task_count: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCategoryInput {
    pub name: String,
    pub color: CategoryColor,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidCategory {
    pub name: String,
    pub color: CategoryColor,
}

impl TaskCategoryInput {
    /// Nome sem espaços nas pontas e com espaços internos colapsados.
    pub fn validate(self) -> AppResult<ValidCategory> {
        let name = self.name.split_whitespace().collect::<Vec<_>>().join(" ");
        if name.is_empty() {
            return Err(AppError::Validation(
                "o nome da categoria é obrigatório".into(),
            ));
        }
        if name.chars().count() > MAX_NAME_CHARS {
            return Err(AppError::Validation(format!(
                "o nome da categoria pode ter no máximo {MAX_NAME_CHARS} caracteres"
            )));
        }
        Ok(ValidCategory {
            name,
            color: self.color,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(name: &str) -> TaskCategoryInput {
        TaskCategoryInput {
            name: name.into(),
            color: CategoryColor::Blue,
        }
    }

    #[test]
    fn normalizes_and_requires_name() {
        assert_eq!(
            input("  Casa   e  jardim ").validate().unwrap().name,
            "Casa e jardim"
        );
        assert!(input("   ").validate().is_err());
        assert!(input(&"x".repeat(MAX_NAME_CHARS + 1)).validate().is_err());
    }

    #[test]
    fn parses_colors() {
        assert_eq!(
            CategoryColor::parse("violet").unwrap(),
            CategoryColor::Violet
        );
        assert_eq!(CategoryColor::Slate.as_str(), "slate");
        assert!(CategoryColor::parse("#ff0000").is_err());
    }
}
