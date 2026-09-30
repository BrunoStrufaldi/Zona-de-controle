//! Analytics: histórico de receita x despesas, categorias mês a mês e evolução
//! do patrimônio (7.1); projeção dos próximos meses (7.2). Somente leitura.

use crate::db::Database;
use crate::domain::finance::analytics::{
    build_analytics, AnalyticsInput, FinanceAnalytics, MonthSpan,
};
use crate::domain::finance::projection::{
    build_projection, ledger_start, FinanceProjection, ProjectionInput,
};
use crate::error::AppResult;
use crate::repositories::clock::local_today;
use crate::repositories::{finance_accounts, finance_recurring, finance_transactions, investments};

/// Análise dos meses `from` a `to` (`aaaa-mm`, até 36 meses).
pub fn analytics(db: &Database, from: &str, to: &str) -> AppResult<FinanceAnalytics> {
    let span = MonthSpan::parse(from, to)?;
    db.with_connection(|connection| {
        let today = local_today(connection)?;
        let range = span.range();
        let monthly = finance_transactions::totals_by_month(connection, range)?;
        let category_months =
            finance_transactions::expenses_by_category_and_month(connection, range)?;
        let previous_categories =
            finance_transactions::expenses_by_category(connection, span.previous().range())?;
        let accounts = finance_accounts::list(connection)?;
        let flows = finance_transactions::paid_balance_flows(connection)?;
        let assets = investments::load_portfolio(connection)?;
        Ok(build_analytics(
            span,
            &AnalyticsInput {
                monthly: &monthly,
                category_months: &category_months,
                previous_categories: &previous_categories,
                accounts: &accounts,
                flows: &flows,
                assets: &assets,
            },
            today,
        ))
    })
}

/// Saldo das contas do dia a dia no fim do mês atual e dos próximos 6, com os
/// valores conhecidos e a estimativa separados.
pub fn projection(db: &Database) -> AppResult<FinanceProjection> {
    db.with_connection(|connection| {
        let today = local_today(connection)?;
        let accounts = finance_accounts::list(connection)?;
        let asset_accounts: Vec<i64> = investments::load_portfolio(connection)?
            .iter()
            .map(|(asset, _, _)| asset.account_id)
            .collect();
        let flows = finance_transactions::paid_balance_flows(connection)?;
        let ledger = finance_transactions::ledger_since(connection, ledger_start(today))?;
        let series = finance_recurring::list(connection)?;
        let parcels = finance_transactions::installment_parcels(connection)?;
        Ok(build_projection(
            &ProjectionInput {
                accounts: &accounts,
                asset_accounts: &asset_accounts,
                flows: &flows,
                ledger: &ledger,
                series: &series,
                parcels: &parcels,
            },
            today,
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::finance::period::YearMonth;

    #[test]
    fn analyzes_the_recorded_months() {
        let db = Database::open_in_memory().unwrap();
        let today = db
            .with_connection(|connection| local_today(connection))
            .unwrap();
        let current = YearMonth::of(today);
        db.with_connection(|connection| {
            connection.execute(
                "INSERT INTO finance_accounts (name, kind, color, opening_balance)
                 VALUES ('C6', 'checking', 'slate', 100000)",
                [],
            )?;
            connection.execute(
                "INSERT INTO finance_transactions (account_id, kind, description, amount, date, status)
                 VALUES (1, 'income', 'Salário', 500000, ?1, 'paid'),
                        (1, 'expense', 'Mercado', 20000, ?1, 'pending')",
                [current.first_day().to_string()],
            )?;
            Ok(())
        })
        .unwrap();

        let from = current.add_months(-1).to_string();
        let result = analytics(&db, &from, &current.to_string()).unwrap();
        assert_eq!(result.months.len(), 2);
        // Mês anterior: nada registrado ainda, patrimônio desconhecido.
        assert!(result.months[0].net_worth.is_none());
        let now = &result.months[1];
        assert_eq!(
            (now.income, now.expenses, now.net),
            (500_000, 20_000, 480_000)
        );
        // O pendente entra nas despesas, mas não no saldo.
        assert_eq!(now.net_worth.unwrap().total, 600_000);
        assert_eq!(result.categories.len(), 1);
        assert!(analytics(&db, "2026-09", "2026-08").is_err());
    }

    #[test]
    fn projects_from_the_current_balance() {
        let db = Database::open_in_memory().unwrap();
        let today = db
            .with_connection(|connection| local_today(connection))
            .unwrap();
        let next = YearMonth::of(today).add_months(1);
        db.with_connection(|connection| {
            connection.execute(
                "INSERT INTO finance_accounts (name, kind, color, opening_balance)
                 VALUES ('C6', 'checking', 'slate', 100000)",
                [],
            )?;
            // Conta de luz já lançada para o mês que vem, ainda pendente.
            connection.execute(
                "INSERT INTO finance_transactions (account_id, kind, description, amount, date, status)
                 VALUES (1, 'expense', 'Luz', 15000, ?1, 'pending')",
                [next.first_day().add_days(9).to_string()],
            )?;
            Ok(())
        })
        .unwrap();

        let result = projection(&db).unwrap();
        assert_eq!(result.start_balance, 100_000);
        assert_eq!(result.months.len(), 7);
        assert_eq!(result.months[1].month, next.to_string());
        assert_eq!(result.months[1].expenses.scheduled, 15_000);
        assert_eq!(result.months[1].balance_known, 85_000);
        // Sem meses completos de histórico: nada estimado.
        assert_eq!(result.estimate.months, 0);
    }
}
