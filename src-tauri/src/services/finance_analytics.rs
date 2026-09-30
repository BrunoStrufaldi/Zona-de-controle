//! Analytics (Fase 7.1): histórico de receita x despesas, categorias mês a mês
//! e evolução do patrimônio. Somente leitura.

use crate::db::Database;
use crate::domain::finance::analytics::{
    build_analytics, AnalyticsInput, FinanceAnalytics, MonthSpan,
};
use crate::error::AppResult;
use crate::repositories::clock::local_today;
use crate::repositories::{finance_accounts, finance_transactions, investments};

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
}
