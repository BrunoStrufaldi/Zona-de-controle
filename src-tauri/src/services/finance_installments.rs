//! Parcelamentos (Fase 5.4): compras parceladas das faturas importadas e o
//! compromisso das faturas dos próximos meses (parcelas + recorrentes no
//! cartão). Somente leitura; o cálculo fica em `domain/finance/installments.rs`.

use crate::db::Database;
use crate::domain::finance::installments::{
    build_overview, InstallmentsOverview, COMMITMENT_MONTHS,
};
use crate::domain::finance::period::YearMonth;
use crate::domain::finance::TransactionKind;
use crate::error::AppResult;
use crate::repositories::clock::local_today;
use crate::repositories::{finance_recurring, finance_transactions};

pub fn overview(db: &Database) -> AppResult<InstallmentsOverview> {
    db.with_connection(|connection| {
        let today = local_today(connection)?;
        let parcels = finance_transactions::installment_parcels(connection)?;
        let series = finance_recurring::list(connection)?;

        let current = YearMonth::of(today);
        let (from, to) = (
            current.first_day(),
            current.add_months(COMMITMENT_MONTHS - 1).last_day(),
        );
        let charges: Vec<_> = series
            .iter()
            .flat_map(|item| item.statement_charges(from, to))
            .collect();
        // Despesas ativas no cartão sem os dias da fatura ficam de fora do compromisso.
        let mut cards_without_cycle: Vec<i64> = series
            .iter()
            .filter(|item| {
                item.on_card
                    && item.kind == TransactionKind::Expense
                    && item.card_cycle.is_none()
                    && item.schedule.last_date().map_or(true, |last| last >= today)
            })
            .map(|item| item.account_id)
            .collect();
        cards_without_cycle.sort_unstable();
        cards_without_cycle.dedup();

        Ok(build_overview(
            &parcels,
            &charges,
            cards_without_cycle,
            today,
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::finance::accounts::{AccountInput, AccountKind};
    use crate::domain::finance::recurring::{RecurringInput, RecurringRule};
    use crate::domain::task_categories::CategoryColor;
    use crate::domain::task_recurrence::RecurrenceFrequency;
    use crate::services::{finance, finance_recurring as recurring};

    fn card(db: &Database, closing: Option<u32>, due: Option<u32>) -> i64 {
        finance::create_account(
            db,
            AccountInput {
                name: format!("Cartão {closing:?}"),
                kind: AccountKind::CreditCard,
                color: CategoryColor::Slate,
                opening_balance: 0,
                closing_day: closing,
                due_day: due,
            },
        )
        .unwrap()
        .id
    }

    fn streaming(account_id: i64, start: &str) -> RecurringInput {
        RecurringInput {
            kind: TransactionKind::Expense,
            description: "Streaming".into(),
            amount: 5_590,
            account_id,
            transfer_account_id: None,
            category_id: None,
            start_date: start.into(),
            recurrence: RecurringRule {
                frequency: RecurrenceFrequency::Monthly,
                interval: 1,
                until: None,
                count: None,
            },
            notes: String::new(),
        }
    }

    #[test]
    fn projects_imported_parcels_and_card_series() {
        let db = Database::open_in_memory().unwrap();
        let with_cycle = card(&db, Some(28), Some(5));
        let without_cycle = card(&db, None, None);
        let today = db
            .with_connection(|connection| local_today(connection))
            .unwrap();
        let start = YearMonth::of(today).first_day().add_days(9);
        recurring::create(&db, streaming(with_cycle, &start.to_string())).unwrap();
        recurring::create(&db, streaming(without_cycle, &start.to_string())).unwrap();
        // Parcela 2/3 de uma compra, na fatura que vence no próximo mês.
        let due = YearMonth::of(today).add_months(1).first_day().add_days(4);
        db.with_connection(|connection| {
            connection.execute(
                "INSERT INTO finance_transactions
                     (account_id, kind, description, amount, date, status, purchase_date,
                      installment_number, installment_count, external_id)
                 VALUES (?1, 'expense', 'LOJA EXEMPLO', 30000, ?2, 'paid', '2026-01-10', 2, 3, 'x')",
                rusqlite::params![with_cycle, due.to_string()],
            )?;
            Ok(())
        })
        .unwrap();

        // A parcela 1 é projetada para o dia 5 deste mês: já paga a partir do dia
        // 6, ainda em aberto nos dias 1 a 5.
        let first_due = YearMonth::of(today).first_day().add_days(4);
        let remaining = if first_due < today { 2 } else { 3 };

        let overview = overview(&db).unwrap();
        assert_eq!(overview.purchases.len(), 1);
        let purchase = &overview.purchases[0];
        assert_eq!((purchase.count, purchase.remaining), (3, remaining));
        assert_eq!(
            overview.summary.remaining_amount,
            30_000 * i64::from(remaining)
        );
        assert_eq!(overview.months[1].installments, 30_000);
        assert_eq!(overview.months[2].installments, 30_000);
        // Fecha dia 28 e vence dia 5: a cobrança do dia 10 entra na fatura do mês seguinte.
        assert_eq!(overview.months[1].recurring, 5_590);
        assert_eq!(overview.cards_without_cycle, vec![without_cycle]);
    }
}
