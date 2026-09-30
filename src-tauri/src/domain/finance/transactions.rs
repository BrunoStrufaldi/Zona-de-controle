//! Lançamentos: entradas e saídas de uma conta, com categoria, tags e status.

use serde::{Deserialize, Serialize};

use crate::domain::calendar::CalendarDate;
use crate::domain::finance::{TransactionKind, MAX_AMOUNT_CENTS};
use crate::domain::tags::normalize_tags;
use crate::error::{AppError, AppResult};

pub const MAX_DESCRIPTION_CHARS: usize = 120;
pub const MAX_NOTES_CHARS: usize = 2_000;

/// Pago (ou recebido, nas entradas) ou pendente.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransactionStatus {
    Paid,
    Pending,
}

impl TransactionStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Paid => "paid",
            Self::Pending => "pending",
        }
    }

    pub fn parse(value: &str) -> AppResult<Self> {
        match value {
            "paid" => Ok(Self::Paid),
            "pending" => Ok(Self::Pending),
            other => Err(AppError::Validation(format!(
                "status de lançamento inválido: {other}"
            ))),
        }
    }
}

/// Parcela `number` de `count` de uma compra parcelada (ex.: 3/6).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installment {
    pub number: u32,
    pub count: u32,
}

/// Maior número de parcelas aceito (35 anos: cobre financiamentos longos).
pub const MAX_INSTALLMENTS: u32 = 420;

impl Installment {
    pub fn new(number: u32, count: u32) -> Option<Self> {
        (number >= 1 && number <= count && count <= MAX_INSTALLMENTS)
            .then_some(Self { number, count })
    }
}

/// Lançamento como exposto ao frontend.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub id: i64,
    /// Conta do lançamento; na transferência, a conta de onde o dinheiro sai.
    pub account_id: i64,
    /// Só na transferência: a conta para onde o dinheiro vai.
    pub transfer_account_id: Option<i64>,
    pub category_id: Option<i64>,
    pub kind: TransactionKind,
    pub description: String,
    /// Centavos, sempre positivo (o tipo define se entra, sai ou move).
    pub amount: i64,
    /// Data local `aaaa-mm-dd` (na fatura do cartão, o vencimento).
    pub date: String,
    pub status: TransactionStatus,
    pub notes: String,
    pub tags: Vec<String>,
    /// Importados da fatura: data da compra.
    pub purchase_date: Option<String>,
    pub installment: Option<Installment>,
    /// Veio de um extrato importado.
    pub imported: bool,
    /// Vinculado a um vencimento desta recorrente.
    pub recurring_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

/// Dados de criação/edição (substituição completa).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionInput {
    pub account_id: i64,
    #[serde(default)]
    pub transfer_account_id: Option<i64>,
    #[serde(default)]
    pub category_id: Option<i64>,
    pub kind: TransactionKind,
    pub description: String,
    pub amount: i64,
    pub date: String,
    pub status: TransactionStatus,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// Dados que só um lançamento importado tem (não mudam ao editar).
#[derive(Debug, Clone, PartialEq)]
pub struct ImportedFields {
    pub external_id: String,
    pub purchase_date: Option<CalendarDate>,
    pub installment: Option<Installment>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidTransaction {
    pub account_id: i64,
    pub transfer_account_id: Option<i64>,
    pub category_id: Option<i64>,
    pub kind: TransactionKind,
    pub description: String,
    pub amount: i64,
    pub date: CalendarDate,
    pub status: TransactionStatus,
    pub notes: String,
    pub tags: Vec<String>,
    /// Só na criação por importação; a edição nunca altera esses dados.
    pub imported: Option<ImportedFields>,
}

impl TransactionInput {
    pub fn validate(self) -> AppResult<ValidTransaction> {
        let description = self.description.trim().to_string();
        if description.is_empty() {
            return Err(AppError::Validation("a descrição é obrigatória".into()));
        }
        if description.chars().count() > MAX_DESCRIPTION_CHARS {
            return Err(AppError::Validation(format!(
                "a descrição pode ter no máximo {MAX_DESCRIPTION_CHARS} caracteres"
            )));
        }
        if self.amount <= 0 {
            return Err(AppError::Validation(
                "o valor precisa ser maior que zero".into(),
            ));
        }
        if self.amount > MAX_AMOUNT_CENTS {
            return Err(AppError::Validation(
                "o valor está acima do limite aceito".into(),
            ));
        }
        let date = CalendarDate::parse(self.date.trim())
            .ok_or_else(|| AppError::Validation(format!("data inválida: {}", self.date)))?;
        let notes = self.notes.trim().to_string();
        if notes.chars().count() > MAX_NOTES_CHARS {
            return Err(AppError::Validation(format!(
                "a observação pode ter no máximo {MAX_NOTES_CHARS} caracteres"
            )));
        }
        let (transfer_account_id, category_id) = match self.kind {
            TransactionKind::Transfer => {
                let target = self.transfer_account_id.ok_or_else(|| {
                    AppError::Validation("escolha a conta de destino da transferência".into())
                })?;
                if target == self.account_id {
                    return Err(AppError::Validation(
                        "a conta de destino precisa ser diferente da de origem".into(),
                    ));
                }
                // Transferência não tem categoria.
                (Some(target), None)
            }
            _ => (None, self.category_id),
        };

        Ok(ValidTransaction {
            account_id: self.account_id,
            transfer_account_id,
            category_id,
            kind: self.kind,
            description,
            amount: self.amount,
            date,
            status: self.status,
            notes,
            tags: normalize_tags(self.tags)?,
            imported: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> TransactionInput {
        TransactionInput {
            account_id: 1,
            transfer_account_id: None,
            category_id: Some(2),
            kind: TransactionKind::Expense,
            description: "  Mercado do mês  ".into(),
            amount: 45_390,
            date: "2026-09-28".into(),
            status: TransactionStatus::Paid,
            notes: "  ".into(),
            tags: vec!["Casa".into(), "casa".into()],
        }
    }

    #[test]
    fn validates_and_normalizes() {
        let valid = input().validate().unwrap();
        assert_eq!(valid.description, "Mercado do mês");
        assert_eq!(valid.date.to_string(), "2026-09-28");
        assert_eq!(valid.notes, "");
        assert_eq!(valid.tags, vec!["casa"]);
    }

    #[test]
    fn rejects_invalid_values() {
        let with = |change: fn(&mut TransactionInput)| {
            let mut value = input();
            change(&mut value);
            value.validate()
        };
        assert!(with(|t| t.description = "   ".into()).is_err());
        assert!(with(|t| t.description = "x".repeat(MAX_DESCRIPTION_CHARS + 1)).is_err());
        assert!(with(|t| t.amount = 0).is_err());
        assert!(with(|t| t.amount = -500).is_err());
        assert!(with(|t| t.amount = MAX_AMOUNT_CENTS + 1).is_err());
        assert!(with(|t| t.date = "28/09/2026".into()).is_err());
        assert!(with(|t| t.date = "2026-02-29".into()).is_err());
        assert!(with(|t| t.notes = "x".repeat(MAX_NOTES_CHARS + 1)).is_err());
        assert!(with(|t| t.amount = MAX_AMOUNT_CENTS).is_ok());
    }

    #[test]
    fn transfers_need_another_account_and_no_category() {
        let mut transfer = input();
        transfer.kind = TransactionKind::Transfer;
        assert!(transfer.clone().validate().is_err());

        transfer.transfer_account_id = Some(1);
        assert!(transfer.clone().validate().is_err());

        transfer.transfer_account_id = Some(3);
        let valid = transfer.validate().unwrap();
        assert_eq!(valid.transfer_account_id, Some(3));
        assert_eq!(valid.category_id, None);

        // Fora da transferência, a conta de destino é descartada.
        let mut expense = input();
        expense.transfer_account_id = Some(3);
        assert_eq!(expense.validate().unwrap().transfer_account_id, None);
    }

    #[test]
    fn validates_installments() {
        assert_eq!(
            Installment::new(3, 6),
            Some(Installment {
                number: 3,
                count: 6
            })
        );
        assert!(Installment::new(0, 6).is_none());
        assert!(Installment::new(7, 6).is_none());
        assert!(Installment::new(1, MAX_INSTALLMENTS + 1).is_none());
    }

    #[test]
    fn deserializes_with_defaults() {
        let parsed: TransactionInput = serde_json::from_str(
            r#"{ "accountId": 1, "kind": "income", "description": "Salário",
                 "amount": 500000, "date": "2026-10-05", "status": "pending" }"#,
        )
        .unwrap();
        assert_eq!(
            (parsed.category_id, parsed.transfer_account_id),
            (None, None)
        );
        assert_eq!(parsed.status, TransactionStatus::Pending);
        assert!(parsed.tags.is_empty() && parsed.notes.is_empty());
        assert!(TransactionStatus::parse("late").is_err());
    }
}
