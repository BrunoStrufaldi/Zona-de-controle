//! Casos de uso das recorrentes (Fase 5.3): séries, vencimentos do período e
//! o registro, vínculo ou pulo de cada vencimento. A exclusão da série é
//! auditada (sucesso e falha); os lançamentos vinculados continuam.

use rusqlite::Connection;
use serde_json::json;

use crate::db::Database;
use crate::domain::calendar::CalendarDate;
use crate::domain::finance::period::DateRange;
use crate::domain::finance::recurring::{
    build_overview, check_schedule_change, RecurringInput, RecurringOverview, RecurringSeriesView,
    Resolution, Series, MAX_RECURRING,
};
use crate::domain::finance::transactions::{Transaction, TransactionInput};
use crate::error::{AppError, AppResult};
use crate::repositories::clock::local_today;
use crate::repositories::finance_recurring::RECURRING_NOT_FOUND;
use crate::repositories::finance_transactions::TRANSACTION_NOT_FOUND;
use crate::repositories::{finance_recurring, finance_transactions};
use crate::services::finance::delete_with_audit;

const ACTION_RECURRING_DELETED: &str = "finance_recurring.deleted";

/// Séries, vencimentos de `from` a `to` (até um ano), atrasados de antes e resumos.
pub fn list(db: &Database, from: &str, to: &str) -> AppResult<RecurringOverview> {
    let range = DateRange::parse(from, to)?;
    db.with_connection(|connection| {
        let today = local_today(connection)?;
        let series = finance_recurring::list(connection)?;
        Ok(build_overview(&series, range.from, range.to, today))
    })
}

pub fn create(db: &Database, input: RecurringInput) -> AppResult<RecurringSeriesView> {
    let valid = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        if finance_recurring::count(&transaction)? >= MAX_RECURRING {
            return Err(AppError::Validation(format!(
                "é possível ter no máximo {MAX_RECURRING} recorrentes"
            )));
        }
        let id = finance_recurring::insert(&transaction, &valid)?;
        let created = load_view(&transaction, id)?;
        transaction.commit()?;
        Ok(created)
    })
}

/// Edita a série. Os vencimentos em aberto passam a usar os novos dados; os
/// resolvidos continuam como estão (histórico).
pub fn update(db: &Database, id: i64, input: RecurringInput) -> AppResult<RecurringSeriesView> {
    let valid = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let current = load(&transaction, id)?;
        check_schedule_change(&current.schedule, &valid.schedule, current.last_resolved())?;
        finance_recurring::update(&transaction, id, &valid)?;
        let updated = load_view(&transaction, id)?;
        transaction.commit()?;
        Ok(updated)
    })
}

/// Exclusão definitiva da série (auditada). Os lançamentos vinculados continuam.
pub fn delete(db: &Database, id: i64) -> AppResult<()> {
    db.with_connection(|connection| {
        delete_with_audit(connection, ACTION_RECURRING_DELETED, id, |transaction| {
            let series = finance_recurring::delete(transaction, id)?;
            let linked = series
                .resolved
                .values()
                .filter(|resolution| matches!(resolution, Resolution::Linked { .. }))
                .count();
            Ok(json!({
                "title": series.description,
                "kind": series.kind.as_str(),
                "amount": series.amount,
                "linkedTransactions": linked,
            }))
        })
    })
}

/// Cria o lançamento do vencimento (mesmo tipo da série) e o vincula.
pub fn register_occurrence(
    db: &Database,
    id: i64,
    occurrence_date: &str,
    input: TransactionInput,
) -> AppResult<Transaction> {
    let valid = input.validate()?;
    let date = parse_occurrence_date(occurrence_date)?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let series = load_open(&transaction, id, date)?;
        if valid.kind != series.kind {
            return Err(AppError::Validation(
                "o lançamento precisa ser do mesmo tipo da recorrente".into(),
            ));
        }
        let transaction_id = finance_transactions::insert(&transaction, &valid)?;
        finance_recurring::link(&transaction, id, date, transaction_id)?;
        let created = finance_transactions::find(&transaction, transaction_id)?
            .ok_or(AppError::NotFound(TRANSACTION_NOT_FOUND))?;
        transaction.commit()?;
        Ok(created)
    })
}

/// Vincula o vencimento a um lançamento que já existe (mesmo tipo, sem outro vínculo).
pub fn link_occurrence(
    db: &Database,
    id: i64,
    occurrence_date: &str,
    transaction_id: i64,
) -> AppResult<()> {
    let date = parse_occurrence_date(occurrence_date)?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let series = load_open(&transaction, id, date)?;
        let target = finance_transactions::find(&transaction, transaction_id)?
            .ok_or(AppError::NotFound(TRANSACTION_NOT_FOUND))?;
        if target.kind != series.kind {
            return Err(AppError::Validation(
                "o lançamento precisa ser do mesmo tipo da recorrente".into(),
            ));
        }
        finance_recurring::link(&transaction, id, date, transaction_id)?;
        transaction.commit()?;
        Ok(())
    })
}

/// Pula o vencimento (não vai haver lançamento para ele).
pub fn skip_occurrence(db: &Database, id: i64, occurrence_date: &str) -> AppResult<()> {
    let date = parse_occurrence_date(occurrence_date)?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        load_open(&transaction, id, date)?;
        finance_recurring::skip(&transaction, id, date)?;
        transaction.commit()?;
        Ok(())
    })
}

/// Desfaz o vínculo ou o pulo; o lançamento vinculado continua existindo.
pub fn reopen_occurrence(db: &Database, id: i64, occurrence_date: &str) -> AppResult<()> {
    let date = parse_occurrence_date(occurrence_date)?;
    db.with_connection(|connection| finance_recurring::reopen(connection, id, date))
}

fn parse_occurrence_date(value: &str) -> AppResult<CalendarDate> {
    CalendarDate::parse(value)
        .ok_or_else(|| AppError::Validation(format!("data de vencimento inválida: {value}")))
}

fn load(connection: &Connection, id: i64) -> AppResult<Series> {
    finance_recurring::find(connection, id)?.ok_or(AppError::NotFound(RECURRING_NOT_FOUND))
}

/// A série, se `date` for um vencimento dela ainda em aberto.
fn load_open(connection: &Connection, id: i64, date: CalendarDate) -> AppResult<Series> {
    let series = load(connection, id)?;
    if series.resolved.contains_key(&date) {
        return Err(AppError::Validation(
            "este vencimento já foi registrado ou pulado".into(),
        ));
    }
    if !series.schedule.is_rule_date(date) {
        return Err(AppError::Validation(
            "a data não é um vencimento desta recorrente".into(),
        ));
    }
    Ok(series)
}

fn load_view(connection: &Connection, id: i64) -> AppResult<RecurringSeriesView> {
    let today = local_today(connection)?;
    Ok(load(connection, id)?.view(today))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::finance::accounts::{AccountInput, AccountKind};
    use crate::domain::finance::recurring::{OccurrenceStatus, RecurringRule};
    use crate::domain::finance::transactions::TransactionStatus;
    use crate::domain::finance::TransactionKind;
    use crate::domain::task_categories::CategoryColor;
    use crate::domain::task_recurrence::RecurrenceFrequency;
    use crate::repositories::audit;
    use crate::services::finance;

    fn account(db: &Database, name: &str) -> i64 {
        finance::create_account(
            db,
            AccountInput {
                name: name.into(),
                kind: AccountKind::Checking,
                color: CategoryColor::Slate,
                opening_balance: 0,
                closing_day: None,
                due_day: None,
            },
        )
        .unwrap()
        .id
    }

    fn rent(account_id: i64, start: &str) -> RecurringInput {
        RecurringInput {
            kind: TransactionKind::Expense,
            description: "Aluguel".into(),
            amount: 200_000,
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

    fn payment(account_id: i64, amount: i64, date: &str) -> TransactionInput {
        TransactionInput {
            account_id,
            transfer_account_id: None,
            category_id: None,
            kind: TransactionKind::Expense,
            description: "Aluguel".into(),
            amount,
            date: date.into(),
            status: TransactionStatus::Paid,
            notes: String::new(),
            tags: Vec::new(),
        }
    }

    fn statuses(db: &Database, from: &str, to: &str) -> Vec<(String, OccurrenceStatus)> {
        list(db, from, to)
            .unwrap()
            .occurrences
            .into_iter()
            .map(|occurrence| (occurrence.occurrence_date, occurrence.status))
            .collect()
    }

    #[test]
    fn registers_skips_and_reopens_occurrences() {
        let db = Database::open_in_memory().unwrap();
        let c6 = account(&db, "C6");
        // Longe no futuro: nenhum vencimento vira "atrasado" com o relógio real.
        let series = create(&db, rent(c6, "2090-01-05")).unwrap();
        assert_eq!(series.next_date.as_deref(), Some("2090-01-05"));

        let paid = register_occurrence(
            &db,
            series.id,
            "2090-01-05",
            payment(c6, 205_000, "2090-01-06"),
        )
        .unwrap();
        assert_eq!(paid.recurring_id, Some(series.id));
        skip_occurrence(&db, series.id, "2090-02-05").unwrap();
        assert_eq!(
            statuses(&db, "2090-01-01", "2090-03-31"),
            vec![
                ("2090-01-05".into(), OccurrenceStatus::Paid),
                ("2090-02-05".into(), OccurrenceStatus::Skipped),
                ("2090-03-05".into(), OccurrenceStatus::Open),
            ]
        );
        let overview = list(&db, "2090-01-01", "2090-01-31").unwrap();
        assert_eq!(overview.occurrences[0].amount, 205_000);
        assert_eq!(overview.totals.expenses_realized, 205_000);

        // Já resolvido, fora da regra ou de outro tipo: recusado.
        assert!(matches!(
            skip_occurrence(&db, series.id, "2090-01-05"),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            skip_occurrence(&db, series.id, "2090-03-06"),
            Err(AppError::Validation(_))
        ));
        let mut income = payment(c6, 100, "2090-03-05");
        income.kind = TransactionKind::Income;
        assert!(register_occurrence(&db, series.id, "2090-03-05", income).is_err());

        reopen_occurrence(&db, series.id, "2090-02-05").unwrap();
        // Desfazer o vínculo mantém o lançamento.
        reopen_occurrence(&db, series.id, "2090-01-05").unwrap();
        assert_eq!(
            finance::list_transactions(&db, "2090-01-01", "2090-01-31")
                .unwrap()
                .len(),
            1
        );
        link_occurrence(&db, series.id, "2090-01-05", paid.id).unwrap();
        assert!(matches!(
            link_occurrence(&db, series.id, "2090-02-05", paid.id),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn series_on_a_credit_card_are_marked() {
        let db = Database::open_in_memory().unwrap();
        let card = finance::create_account(
            &db,
            AccountInput {
                name: "Cartão C6".into(),
                kind: AccountKind::CreditCard,
                color: CategoryColor::Slate,
                opening_balance: 0,
                closing_day: None,
                due_day: None,
            },
        )
        .unwrap()
        .id;
        let checking = account(&db, "C6");
        assert!(create(&db, rent(card, "2090-01-05")).unwrap().on_card);
        assert!(!create(&db, rent(checking, "2090-01-05")).unwrap().on_card);
    }

    #[test]
    fn schedule_changes_keep_the_history() {
        let db = Database::open_in_memory().unwrap();
        let c6 = account(&db, "C6");
        let series = create(&db, rent(c6, "2090-01-05")).unwrap();
        register_occurrence(
            &db,
            series.id,
            "2090-02-05",
            payment(c6, 200_000, "2090-02-05"),
        )
        .unwrap();

        // Mudar para o dia 10 desde janeiro misturaria com o histórico.
        assert!(matches!(
            update(&db, series.id, rent(c6, "2090-01-10")),
            Err(AppError::Validation(_))
        ));
        let mut cheaper = rent(c6, "2090-03-10");
        cheaper.amount = 190_000;
        let updated = update(&db, series.id, cheaper).unwrap();
        assert_eq!(updated.last_resolved_date.as_deref(), Some("2090-02-05"));
        assert_eq!(
            statuses(&db, "2090-01-01", "2090-03-31"),
            vec![
                ("2090-02-05".into(), OccurrenceStatus::Paid),
                ("2090-03-10".into(), OccurrenceStatus::Open),
            ]
        );
        // Só o valor muda: vale sem restrição.
        let mut same = rent(c6, "2090-03-10");
        same.amount = 195_000;
        assert_eq!(update(&db, series.id, same).unwrap().amount, 195_000);
    }

    #[test]
    fn deleting_a_series_is_audited_and_keeps_transactions() {
        let db = Database::open_in_memory().unwrap();
        let c6 = account(&db, "C6");
        let series = create(&db, rent(c6, "2090-01-05")).unwrap();
        register_occurrence(
            &db,
            series.id,
            "2090-01-05",
            payment(c6, 200_000, "2090-01-05"),
        )
        .unwrap();
        // A conta usada pela recorrente não pode ser excluída.
        assert!(matches!(
            finance::delete_account(&db, c6),
            Err(AppError::Validation(_))
        ));

        delete(&db, series.id).unwrap();
        assert!(matches!(delete(&db, series.id), Err(AppError::NotFound(_))));
        let log = db
            .with_connection(|connection| audit::list_recent(connection, 5))
            .unwrap();
        assert_eq!(log[0].action, ACTION_RECURRING_DELETED);
        assert_eq!(log[0].outcome, "failure");
        assert_eq!(log[1].outcome, "success");
        assert_eq!(
            log[1].details,
            Some(json!({
                "title": "Aluguel",
                "kind": "expense",
                "amount": 200_000,
                "linkedTransactions": 1,
            }))
        );
        let kept = finance::list_transactions(&db, "2090-01-01", "2090-01-31").unwrap();
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].recurring_id, None);
    }
}
