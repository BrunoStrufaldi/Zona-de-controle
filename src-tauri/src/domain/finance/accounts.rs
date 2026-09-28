//! Contas financeiras (conta corrente, poupança, cartão, dinheiro…).

use serde::{Deserialize, Serialize};

use crate::domain::finance::{normalize_name, MAX_AMOUNT_CENTS};
use crate::domain::task_categories::CategoryColor;
use crate::error::{AppError, AppResult};

pub const MAX_NAME_CHARS: usize = 40;
pub const MAX_ACCOUNTS: usize = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountKind {
    Checking,
    Savings,
    CreditCard,
    Cash,
    /// Aplicações (CDB, Tesouro…): recebe transferências da conta corrente.
    Investment,
    Other,
}

impl AccountKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Checking => "checking",
            Self::Savings => "savings",
            Self::CreditCard => "credit_card",
            Self::Cash => "cash",
            Self::Investment => "investment",
            Self::Other => "other",
        }
    }

    pub fn parse(value: &str) -> AppResult<Self> {
        match value {
            "checking" => Ok(Self::Checking),
            "savings" => Ok(Self::Savings),
            "credit_card" => Ok(Self::CreditCard),
            "cash" => Ok(Self::Cash),
            "investment" => Ok(Self::Investment),
            "other" => Ok(Self::Other),
            other => Err(AppError::Validation(format!(
                "tipo de conta inválido: {other}"
            ))),
        }
    }
}

/// Conta como exposta ao frontend.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinanceAccount {
    pub id: i64,
    pub name: String,
    pub kind: AccountKind,
    pub color: CategoryColor,
    /// Saldo ao começar a usar o app (centavos; pode ser negativo).
    pub opening_balance: i64,
    /// Saldo inicial + entradas pagas − saídas pagas ± transferências pagas (centavos).
    pub balance: i64,
    pub transaction_count: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInput {
    pub name: String,
    pub kind: AccountKind,
    pub color: CategoryColor,
    #[serde(default)]
    pub opening_balance: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidAccount {
    pub name: String,
    pub kind: AccountKind,
    pub color: CategoryColor,
    pub opening_balance: i64,
}

impl AccountInput {
    pub fn validate(self) -> AppResult<ValidAccount> {
        if !(-MAX_AMOUNT_CENTS..=MAX_AMOUNT_CENTS).contains(&self.opening_balance) {
            return Err(AppError::Validation(
                "o saldo inicial está fora do limite aceito".into(),
            ));
        }
        Ok(ValidAccount {
            name: normalize_name(&self.name, "conta", MAX_NAME_CHARS)?,
            kind: self.kind,
            color: self.color,
            opening_balance: self.opening_balance,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(name: &str, opening_balance: i64) -> AccountInput {
        AccountInput {
            name: name.into(),
            kind: AccountKind::Checking,
            color: CategoryColor::Slate,
            opening_balance,
        }
    }

    #[test]
    fn validates_name_and_opening_balance() {
        let valid = input("  C6  Bank ", -15_000).validate().unwrap();
        assert_eq!(valid.name, "C6 Bank");
        assert_eq!(valid.opening_balance, -15_000);
        assert!(input(" ", 0).validate().is_err());
        assert!(input("C6", MAX_AMOUNT_CENTS + 1).validate().is_err());
        assert!(input("C6", -MAX_AMOUNT_CENTS - 1).validate().is_err());
    }

    #[test]
    fn kinds_round_trip() {
        for kind in [
            AccountKind::Checking,
            AccountKind::Savings,
            AccountKind::CreditCard,
            AccountKind::Cash,
            AccountKind::Investment,
            AccountKind::Other,
        ] {
            assert_eq!(AccountKind::parse(kind.as_str()).unwrap(), kind);
            assert_eq!(
                serde_json::to_value(kind).unwrap(),
                serde_json::json!(kind.as_str())
            );
        }
        assert!(AccountKind::parse("broker").is_err());
    }

    #[test]
    fn opening_balance_defaults_to_zero() {
        let parsed: AccountInput =
            serde_json::from_str(r#"{ "name": "Carteira", "kind": "cash", "color": "green" }"#)
                .unwrap();
        assert_eq!(parsed.opening_balance, 0);
    }
}
