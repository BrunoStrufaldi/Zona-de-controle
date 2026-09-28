//! Categorias financeiras: de receita ou de despesa (o tipo não muda depois).

use serde::{Deserialize, Serialize};

use crate::domain::finance::{normalize_name, TransactionKind};
use crate::domain::task_categories::CategoryColor;
use crate::error::{AppError, AppResult};

pub const MAX_NAME_CHARS: usize = 40;
pub const MAX_CATEGORIES: usize = 100;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinanceCategory {
    pub id: i64,
    pub kind: TransactionKind,
    pub name: String,
    pub color: CategoryColor,
    pub transaction_count: u32,
}

/// Criação: tipo, nome e cor.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryInput {
    pub kind: TransactionKind,
    pub name: String,
    pub color: CategoryColor,
}

/// Edição: só nome e cor (mudar o tipo deixaria lançamentos incoerentes).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryUpdate {
    pub name: String,
    pub color: CategoryColor,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidCategoryName {
    pub name: String,
    pub color: CategoryColor,
}

impl CategoryUpdate {
    pub fn validate(self) -> AppResult<ValidCategoryName> {
        Ok(ValidCategoryName {
            name: normalize_name(&self.name, "categoria", MAX_NAME_CHARS)?,
            color: self.color,
        })
    }
}

impl CategoryInput {
    pub fn validate(self) -> AppResult<(TransactionKind, ValidCategoryName)> {
        let kind = self.kind;
        if kind == TransactionKind::Transfer {
            return Err(AppError::Validation(
                "categorias são só de receita ou de despesa".into(),
            ));
        }
        let valid = CategoryUpdate {
            name: self.name,
            color: self.color,
        }
        .validate()?;
        Ok((kind, valid))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_names() {
        let (kind, valid) = CategoryInput {
            kind: TransactionKind::Expense,
            name: "  Pets  e   veterinário ".into(),
            color: CategoryColor::Amber,
        }
        .validate()
        .unwrap();
        assert_eq!(kind, TransactionKind::Expense);
        assert_eq!(valid.name, "Pets e veterinário");
        assert!(CategoryUpdate {
            name: "".into(),
            color: CategoryColor::Red
        }
        .validate()
        .is_err());
        assert!(CategoryInput {
            kind: TransactionKind::Transfer,
            name: "Movimentações".into(),
            color: CategoryColor::Slate,
        }
        .validate()
        .is_err());
    }
}
