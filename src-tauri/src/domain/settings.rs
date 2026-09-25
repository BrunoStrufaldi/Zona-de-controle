//! Regras de validação das configurações do app.

use crate::error::{AppError, AppResult};

pub const MAX_KEY_LENGTH: usize = 64;
/// Limite do valor serializado em JSON (16 KiB).
pub const MAX_VALUE_BYTES: usize = 16 * 1024;

/// Chaves: 1–64 caracteres, começando por letra minúscula, contendo apenas
/// `a-z`, `0-9`, `.`, `_` e `-` (ex.: `profile.displayName` não é válido;
/// use `profile.display_name`).
pub fn validate_key(key: &str) -> AppResult<()> {
    let starts_with_letter = key.chars().next().is_some_and(|c| c.is_ascii_lowercase());
    let valid_chars = key
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-'));

    if key.len() > MAX_KEY_LENGTH || !starts_with_letter || !valid_chars {
        return Err(AppError::Validation(format!(
            "chave de configuração inválida: \"{key}\""
        )));
    }
    Ok(())
}

pub fn validate_serialized_value(serialized: &str) -> AppResult<()> {
    if serialized.len() > MAX_VALUE_BYTES {
        return Err(AppError::Validation(format!(
            "valor de configuração excede {MAX_VALUE_BYTES} bytes"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_well_formed_keys() {
        for key in ["theme", "profile.display_name", "sidebar-width", "a1"] {
            assert!(validate_key(key).is_ok(), "{key}");
        }
    }

    #[test]
    fn rejects_malformed_keys() {
        let too_long = "a".repeat(MAX_KEY_LENGTH + 1);
        for key in [
            "",
            "1abc",
            "Profile",
            "com espaço",
            "../etc",
            too_long.as_str(),
        ] {
            assert!(validate_key(key).is_err(), "{key}");
        }
    }

    #[test]
    fn rejects_oversized_values() {
        assert!(validate_serialized_value(&"x".repeat(MAX_VALUE_BYTES + 1)).is_err());
        assert!(validate_serialized_value("\"ok\"").is_ok());
    }
}
