//! Importação de extratos (Fase 5.2): leitura dos arquivos exportados pelo banco
//! (OFX do extrato e CSV da fatura do cartão do C6), sugestões de tipo e
//! categoria e a conversão das linhas escolhidas em lançamentos.
//!
//! Tudo aqui é puro (sem banco): os testes usam amostras fictícias com o mesmo
//! formato dos arquivos reais, nunca extratos de verdade.

pub mod c6_card;
pub mod ofx;
pub mod suggest;

use serde::Serialize;

use crate::domain::calendar::CalendarDate;
use crate::domain::finance::accounts::AccountKind;
use crate::domain::finance::transactions::Installment;
use crate::domain::finance::MAX_AMOUNT_CENTS;
use crate::error::{AppError, AppResult};

/// Maior arquivo aceito (um ano de extrato tem poucas centenas de KB).
pub const MAX_FILE_BYTES: usize = 5 * 1024 * 1024;
/// Mais linhas que isso num arquivo indica algo errado (ou outro formato).
pub const MAX_LINES: usize = 5_000;
/// Descrições maiores são cortadas (limite do lançamento).
const MAX_DESCRIPTION_CHARS: usize = 120;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportFormat {
    /// Extrato em OFX (conta corrente, poupança).
    Ofx,
    /// Fatura do cartão do C6 em CSV.
    C6CardCsv,
}

impl ImportFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Ofx => "ofx",
            Self::C6CardCsv => "c6_card_csv",
        }
    }
}

/// Uma linha do arquivo, antes de decidir tipo e categoria.
#[derive(Debug, Clone, PartialEq)]
pub struct StatementLine {
    /// Identificador de origem, único: impede importar a mesma linha duas vezes.
    pub external_id: String,
    /// OFX: data do lançamento. Fatura: data da compra.
    pub date: CalendarDate,
    pub description: String,
    /// Centavos com sinal do ponto de vista da conta: positivo entra, negativo sai.
    pub amount: i64,
    pub installment: Option<Installment>,
    /// Categoria que o banco deu à compra (fatura), se houver.
    pub source_category: Option<String>,
    /// Pagamento da fatura anterior registrado na própria fatura.
    pub bill_payment: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedStatement {
    pub format: ImportFormat,
    pub lines: Vec<StatementLine>,
    /// Tipo de conta provável (para a tela pré-selecionar a conta).
    pub account_kind: Option<AccountKind>,
}

/// Reconhece o formato pelo conteúdo e lê o arquivo.
pub fn parse_statement(content: &str) -> AppResult<ParsedStatement> {
    if content.len() > MAX_FILE_BYTES {
        return Err(AppError::Validation(
            "o arquivo é grande demais (máximo de 5 MB)".into(),
        ));
    }
    let content = content.trim_start_matches('\u{feff}');
    let parsed = if content.to_ascii_uppercase().contains("<OFX>") {
        ofx::parse(content)?
    } else if c6_card::looks_like(content) {
        c6_card::parse(content)?
    } else {
        return Err(AppError::Validation(
            "formato não reconhecido: use o extrato em OFX ou a fatura do cartão do C6 em CSV"
                .into(),
        ));
    };
    if parsed.lines.is_empty() {
        return Err(AppError::Validation("o arquivo não tem lançamentos".into()));
    }
    if parsed.lines.len() > MAX_LINES {
        return Err(AppError::Validation(format!(
            "o arquivo tem mais de {MAX_LINES} lançamentos; exporte um período menor"
        )));
    }
    Ok(parsed)
}

/// Converte um valor decimal em centavos com sinal. Aceita ponto ou vírgula
/// como separador decimal ("-123.45", "1.234,56", "1,234.56", "50").
pub fn parse_cents(raw: &str) -> Option<i64> {
    let value: String = raw.chars().filter(|c| !c.is_whitespace()).collect();
    let (negative, digits) = match value.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, value.strip_prefix('+').unwrap_or(&value)),
    };
    if digits.is_empty()
        || !digits
            .chars()
            .all(|c| c.is_ascii_digit() || c == '.' || c == ',')
    {
        return None;
    }
    // O último separador é o decimal quando tem 1 ou 2 dígitos depois dele.
    let (integer, fraction) = match digits.rfind(['.', ',']) {
        Some(at) if (1..=2).contains(&(digits.len() - at - 1)) => {
            (&digits[..at], &digits[at + 1..])
        }
        _ => (digits, ""),
    };
    let integer: String = integer.chars().filter(char::is_ascii_digit).collect();
    let integer: i64 = if integer.is_empty() {
        0
    } else {
        integer.parse().ok()?
    };
    let fraction: i64 = format!("{fraction:0<2}").parse().ok()?;
    let cents = integer.checked_mul(100)?.checked_add(fraction)?;
    if cents > MAX_AMOUNT_CENTS {
        return None;
    }
    Some(if negative { -cents } else { cents })
}

/// Primeira data `aaaa-mm-dd` válida no nome do arquivo (a fatura do C6 traz
/// o vencimento no nome, ex.: `Fatura_2026-09-05.csv`).
pub fn date_in_file_name(file_name: &str) -> Option<CalendarDate> {
    let chars: Vec<char> = file_name.chars().collect();
    chars
        .windows(10)
        .map(|window| window.iter().collect::<String>())
        .find_map(|candidate| CalendarDate::parse(&candidate))
}

/// Descrição limpa: espaços colapsados e no máximo o tamanho do lançamento.
fn clean_description(raw: &str) -> String {
    let collapsed = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().take(MAX_DESCRIPTION_CHARS).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_amounts_with_either_separator() {
        assert_eq!(parse_cents("-123.45"), Some(-12_345));
        assert_eq!(parse_cents("1.234,56"), Some(123_456));
        assert_eq!(parse_cents("1,234.56"), Some(123_456));
        assert_eq!(parse_cents("50"), Some(5_000));
        assert_eq!(parse_cents("12.5"), Some(1_250));
        assert_eq!(parse_cents("+0.01"), Some(1));
        assert_eq!(parse_cents("1.234"), Some(123_400));
        for invalid in ["", "-", "abc", "12a", "--1"] {
            assert_eq!(parse_cents(invalid), None, "{invalid}");
        }
        assert_eq!(parse_cents("9999999999999"), None);
    }

    #[test]
    fn finds_the_due_date_in_the_file_name() {
        assert_eq!(
            date_in_file_name("Fatura_2026-09-05.csv").map(|d| d.to_string()),
            Some("2026-09-05".to_string())
        );
        assert_eq!(date_in_file_name("Extrato_28_09_2026.ofx"), None);
        assert_eq!(date_in_file_name("fatura-2026-02-30.csv"), None);
    }

    #[test]
    fn rejects_unknown_formats() {
        assert!(matches!(
            parse_statement("data;valor\n01/01/2026;10"),
            Err(AppError::Validation(_))
        ));
        let huge = "x".repeat(MAX_FILE_BYTES + 1);
        assert!(parse_statement(&huge).is_err());
    }

    #[test]
    fn cleans_descriptions() {
        assert_eq!(clean_description("  PIX   ENVIADO \n "), "PIX ENVIADO");
        assert_eq!(clean_description(&"a".repeat(200)).chars().count(), 120);
    }
}
