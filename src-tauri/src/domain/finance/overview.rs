//! Resumo financeiro de um mês: totais, histórico e despesas por categoria.
//! Fonte da verdade dos números da Visão Geral e do dashboard.

use serde::Serialize;

use crate::domain::finance::period::YearMonth;
use crate::domain::finance::transactions::TransactionStatus;
use crate::domain::finance::TransactionKind;

/// Meses do histórico (o mês pedido e os anteriores).
pub const HISTORY_MONTHS: i64 = 6;

/// Totais do período em centavos. `income`/`expenses` incluem os pendentes;
/// `*_pending` dizem quanto deles ainda não foi pago/recebido.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodTotals {
    pub income: i64,
    pub income_pending: i64,
    pub expenses: i64,
    pub expenses_pending: i64,
}

impl PeriodTotals {
    /// Soma as linhas `(tipo, status, total)` agrupadas pelo banco.
    pub fn from_rows(rows: &[(TransactionKind, TransactionStatus, i64)]) -> Self {
        let mut totals = Self::default();
        for &(kind, status, amount) in rows {
            let pending = status == TransactionStatus::Pending;
            match kind {
                TransactionKind::Income => {
                    totals.income += amount;
                    if pending {
                        totals.income_pending += amount;
                    }
                }
                TransactionKind::Expense => {
                    totals.expenses += amount;
                    if pending {
                        totals.expenses_pending += amount;
                    }
                }
                // Transferências só movem dinheiro entre contas.
                TransactionKind::Transfer => {}
            }
        }
        totals
    }
}

/// Entradas e saídas de um mês (pagas e pendentes), em centavos.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyCashflow {
    /// `aaaa-mm`.
    pub month: String,
    pub income: i64,
    pub expenses: i64,
}

/// Total de despesas de uma categoria (`None` = sem categoria).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryTotal {
    pub category_id: Option<i64>,
    pub total: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinanceOverview {
    /// `aaaa-mm`.
    pub month: String,
    pub totals: PeriodTotals,
    /// Os últimos [`HISTORY_MONTHS`] meses até `month`, do mais antigo ao mais novo.
    pub history: Vec<MonthlyCashflow>,
    /// Despesas do mês por categoria, da maior para a menor.
    pub expenses_by_category: Vec<CategoryTotal>,
}

/// Monta o histórico até `end` a partir das linhas `(aaaa-mm, tipo, total)`;
/// meses sem lançamentos entram zerados.
pub fn build_history(
    end: YearMonth,
    rows: &[(String, TransactionKind, i64)],
) -> Vec<MonthlyCashflow> {
    (0..HISTORY_MONTHS)
        .rev()
        .map(|back| {
            let month = end.add_months(-back).to_string();
            let sum = |wanted: TransactionKind| {
                rows.iter()
                    .filter(|(row_month, kind, _)| *row_month == month && *kind == wanted)
                    .map(|(_, _, total)| total)
                    .sum()
            };
            MonthlyCashflow {
                income: sum(TransactionKind::Income),
                expenses: sum(TransactionKind::Expense),
                month,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn totals_include_pending_and_say_how_much() {
        use TransactionKind::{Expense, Income};
        use TransactionStatus::{Paid, Pending};

        let totals = PeriodTotals::from_rows(&[
            (Income, Paid, 800_000),
            (Income, Pending, 50_000),
            (Expense, Paid, 300_000),
            (Expense, Pending, 120_000),
            (TransactionKind::Transfer, Paid, 999_999),
        ]);
        assert_eq!(
            totals,
            PeriodTotals {
                income: 850_000,
                income_pending: 50_000,
                expenses: 420_000,
                expenses_pending: 120_000,
            }
        );
        assert_eq!(PeriodTotals::from_rows(&[]), PeriodTotals::default());
    }

    #[test]
    fn history_fills_missing_months_with_zero() {
        let end = YearMonth::parse("2026-02").unwrap();
        let history = build_history(
            end,
            &[
                ("2025-10".into(), TransactionKind::Income, 500_000),
                ("2025-10".into(), TransactionKind::Expense, 200_000),
                ("2026-02".into(), TransactionKind::Expense, 90_000),
                // Fora da janela: ignorado.
                ("2025-08".into(), TransactionKind::Income, 1),
            ],
        );
        let months: Vec<_> = history.iter().map(|row| row.month.as_str()).collect();
        assert_eq!(
            months,
            vec!["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]
        );
        assert_eq!((history[0].income, history[0].expenses), (0, 0));
        assert_eq!((history[1].income, history[1].expenses), (500_000, 200_000));
        assert_eq!((history[5].income, history[5].expenses), (0, 90_000));
    }
}
