//! Erro único da camada nativa, serializado de forma estável para o frontend.

use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("erro no banco de dados: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("falha ao aplicar a migration {version}: {source}")]
    Migration {
        version: u32,
        #[source]
        source: rusqlite::Error,
    },

    #[error("erro de serialização: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("erro de entrada/saída: {0}")]
    Io(#[from] std::io::Error),

    #[error("erro do Tauri: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("{0}")]
    Validation(String),

    /// Recurso inexistente; a mensagem é exibida ao usuário (ex.: "tarefa não encontrada").
    #[error("{0}")]
    NotFound(&'static str),

    #[error("estado interno indisponível")]
    StatePoisoned,
}

impl AppError {
    /// Categoria estável do erro, usada pelo frontend para decidir a mensagem.
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Database(_) => "database",
            Self::Migration { .. } => "migration",
            Self::Serialization(_) => "serialization",
            Self::Io(_) => "io",
            Self::Tauri(_) => "tauri",
            Self::Validation(_) => "validation",
            Self::NotFound(_) => "not_found",
            Self::StatePoisoned => "internal",
        }
    }
}

/// Os erros chegam ao frontend como `{ kind, message }`.
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("kind", self.kind())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_kind_and_message() {
        let error = AppError::Validation("chave inválida".into());
        let json = serde_json::to_value(&error).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "kind": "validation", "message": "chave inválida" })
        );
    }
}
