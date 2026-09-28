//! Texto para comparação: minúsculas e sem acentos (sem dependências externas;
//! cobre as letras acentuadas do português e as mais comuns do latim).

/// "Descrição" → "descricao".
pub fn fold(text: &str) -> String {
    text.chars()
        .flat_map(char::to_lowercase)
        .map(|ch| match ch {
            'á' | 'à' | 'â' | 'ã' | 'ä' | 'å' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            other => other,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_accents_and_case() {
        assert_eq!(fold("Descrição"), "descricao");
        assert_eq!(fold("CARTÃO Ávila Ñ"), "cartao avila n");
        assert_eq!(fold("Valor (em R$)"), "valor (em r$)");
    }
}
