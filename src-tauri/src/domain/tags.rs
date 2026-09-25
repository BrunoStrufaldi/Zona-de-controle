//! Tags compartilhadas entre módulos (tarefas e notas), na tabela `tags`.

use crate::error::{AppError, AppResult};

pub const MAX_TAGS: usize = 10;
pub const MAX_TAG_CHARS: usize = 32;

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
            "use no máximo {MAX_TAGS} tags"
        )));
    }
    Ok(tags)
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
