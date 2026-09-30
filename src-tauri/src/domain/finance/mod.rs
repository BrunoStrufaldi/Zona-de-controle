//! Finanças (Fase 5): contas, categorias, lançamentos, recorrentes e resumos do período.
//! Espelhado em `src/features/finance/types.ts`.
//!
//! Valores monetários são sempre centavos (`i64`); a conversão para reais
//! acontece só na exibição.

pub mod accounts;
pub mod cards;
pub mod categories;
pub mod import;
pub mod installments;
pub mod overview;
pub mod period;
pub mod recurring;
pub mod transactions;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

/// Maior valor aceito (R$ 999.999.999,99), com folga para somas em `i64`.
pub const MAX_AMOUNT_CENTS: i64 = 99_999_999_999;

/// Entrada (receita), saída (despesa) ou transferência entre contas. Categorias
/// só existem para entradas e saídas.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransactionKind {
    Income,
    Expense,
    Transfer,
}

impl TransactionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Income => "income",
            Self::Expense => "expense",
            Self::Transfer => "transfer",
        }
    }

    pub fn parse(value: &str) -> AppResult<Self> {
        match value {
            "income" => Ok(Self::Income),
            "expense" => Ok(Self::Expense),
            "transfer" => Ok(Self::Transfer),
            other => Err(AppError::Validation(format!(
                "tipo de lançamento inválido: {other}"
            ))),
        }
    }
}

/// Nome sem espaços nas pontas e com espaços internos colapsados, obrigatório
/// e com no máximo `max_chars` caracteres. `what` entra na mensagem de erro.
pub(crate) fn normalize_name(raw: &str, what: &str, max_chars: usize) -> AppResult<String> {
    let name = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        return Err(AppError::Validation(format!(
            "o nome da {what} é obrigatório"
        )));
    }
    if name.chars().count() > max_chars {
        return Err(AppError::Validation(format!(
            "o nome da {what} pode ter no máximo {max_chars} caracteres"
        )));
    }
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_names() {
        assert_eq!(
            normalize_name("  Conta   do  C6 ", "conta", 40).unwrap(),
            "Conta do C6"
        );
        assert!(normalize_name("   ", "conta", 40).is_err());
        assert!(normalize_name(&"x".repeat(41), "conta", 40).is_err());
    }

    #[test]
    fn parses_transaction_kinds() {
        assert_eq!(
            TransactionKind::parse("income").unwrap(),
            TransactionKind::Income
        );
        assert_eq!(TransactionKind::Expense.as_str(), "expense");
        assert_eq!(
            TransactionKind::parse("transfer").unwrap(),
            TransactionKind::Transfer
        );
        assert!(TransactionKind::parse("refund").is_err());
    }
}
