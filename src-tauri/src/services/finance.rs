//! Casos de uso de Finanças: contas, categorias, lançamentos e resumo do mês.
//! Validação e transações ficam aqui; as exclusões são auditadas (sucesso e falha).

use rusqlite::Connection;
use serde_json::{json, Value};

use crate::db::Database;
use crate::domain::audit::{AuditCategory, AuditOutcome, NewAuditEntry};
use crate::domain::finance::accounts::{AccountInput, FinanceAccount, MAX_ACCOUNTS};
use crate::domain::finance::categories::{
    CategoryInput, CategoryUpdate, FinanceCategory, MAX_CATEGORIES,
};
use crate::domain::finance::overview::{
    build_history, FinanceOverview, PeriodTotals, HISTORY_MONTHS,
};
use crate::domain::finance::period::{DateRange, YearMonth};
use crate::domain::finance::transactions::{Transaction, TransactionInput, TransactionStatus};
use crate::error::{AppError, AppResult};
use crate::repositories::finance_accounts::ACCOUNT_NOT_FOUND;
use crate::repositories::finance_categories::CATEGORY_NOT_FOUND;
use crate::repositories::finance_transactions::TRANSACTION_NOT_FOUND;
use crate::repositories::{audit, finance_accounts, finance_categories, finance_transactions};

const ACTION_ACCOUNT_DELETED: &str = "finance_account.deleted";
const ACTION_CATEGORY_DELETED: &str = "finance_category.deleted";
const ACTION_TRANSACTION_DELETED: &str = "transaction.deleted";

// ---------------------------------------------------------------- Contas

pub fn list_accounts(db: &Database) -> AppResult<Vec<FinanceAccount>> {
    db.with_connection(|connection| finance_accounts::list(connection))
}

pub fn create_account(db: &Database, input: AccountInput) -> AppResult<FinanceAccount> {
    let account = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        if finance_accounts::count(&transaction)? >= MAX_ACCOUNTS {
            return Err(AppError::Validation(format!(
                "é possível ter no máximo {MAX_ACCOUNTS} contas"
            )));
        }
        let id = finance_accounts::insert(&transaction, &account)?;
        let created = load_account(&transaction, id)?;
        transaction.commit()?;
        Ok(created)
    })
}

pub fn update_account(db: &Database, id: i64, input: AccountInput) -> AppResult<FinanceAccount> {
    let account = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        finance_accounts::update(&transaction, id, &account)?;
        let updated = load_account(&transaction, id)?;
        transaction.commit()?;
        Ok(updated)
    })
}

/// Exclusão definitiva de uma conta sem lançamentos (auditada).
pub fn delete_account(db: &Database, id: i64) -> AppResult<()> {
    db.with_connection(|connection| {
        delete_with_audit(connection, ACTION_ACCOUNT_DELETED, id, |transaction| {
            let account = finance_accounts::delete(transaction, id)?;
            Ok(json!({ "name": account.name, "kind": account.kind.as_str() }))
        })
    })
}

// ---------------------------------------------------------------- Categorias

pub fn list_categories(db: &Database) -> AppResult<Vec<FinanceCategory>> {
    db.with_connection(|connection| finance_categories::list(connection))
}

pub fn create_category(db: &Database, input: CategoryInput) -> AppResult<FinanceCategory> {
    let (kind, category) = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        if finance_categories::count(&transaction)? >= MAX_CATEGORIES {
            return Err(AppError::Validation(format!(
                "é possível ter no máximo {MAX_CATEGORIES} categorias"
            )));
        }
        let id = finance_categories::insert(&transaction, kind, &category)?;
        let created = load_category(&transaction, id)?;
        transaction.commit()?;
        Ok(created)
    })
}

pub fn update_category(
    db: &Database,
    id: i64,
    input: CategoryUpdate,
) -> AppResult<FinanceCategory> {
    let category = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        finance_categories::update(&transaction, id, &category)?;
        let updated = load_category(&transaction, id)?;
        transaction.commit()?;
        Ok(updated)
    })
}

/// Exclusão definitiva da categoria (auditada); os lançamentos ficam sem categoria.
pub fn delete_category(db: &Database, id: i64) -> AppResult<()> {
    db.with_connection(|connection| {
        delete_with_audit(connection, ACTION_CATEGORY_DELETED, id, |transaction| {
            let category = finance_categories::delete(transaction, id)?;
            Ok(json!({
                "name": category.name,
                "kind": category.kind.as_str(),
                "transactionsDetached": category.transaction_count,
            }))
        })
    })
}

// ---------------------------------------------------------------- Lançamentos

/// Lançamentos de `from` a `to` (inclusive, até um ano).
pub fn list_transactions(db: &Database, from: &str, to: &str) -> AppResult<Vec<Transaction>> {
    let range = DateRange::parse(from, to)?;
    db.with_connection(|connection| finance_transactions::list(connection, range))
}

pub fn list_tags(db: &Database) -> AppResult<Vec<String>> {
    db.with_connection(|connection| finance_transactions::list_tags(connection))
}

pub fn create_transaction(db: &Database, input: TransactionInput) -> AppResult<Transaction> {
    let valid = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let id = finance_transactions::insert(&transaction, &valid)?;
        let created = load_transaction(&transaction, id)?;
        transaction.commit()?;
        Ok(created)
    })
}

pub fn update_transaction(
    db: &Database,
    id: i64,
    input: TransactionInput,
) -> AppResult<Transaction> {
    let valid = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        finance_transactions::update(&transaction, id, &valid)?;
        let updated = load_transaction(&transaction, id)?;
        transaction.commit()?;
        Ok(updated)
    })
}

/// Marca como pago/recebido ou pendente.
pub fn set_transaction_status(
    db: &Database,
    id: i64,
    status: TransactionStatus,
) -> AppResult<Transaction> {
    db.with_connection(|connection| {
        finance_transactions::set_status(connection, id, status)?;
        load_transaction(connection, id)
    })
}

/// Exclusão definitiva do lançamento (auditada, com descrição, valor e data).
pub fn delete_transaction(db: &Database, id: i64) -> AppResult<()> {
    db.with_connection(|connection| {
        delete_with_audit(connection, ACTION_TRANSACTION_DELETED, id, |transaction| {
            let deleted = finance_transactions::delete(transaction, id)?;
            Ok(json!({
                "title": deleted.description,
                "kind": deleted.kind.as_str(),
                "amount": deleted.amount,
                "date": deleted.date,
                "accountId": deleted.account_id,
            }))
        })
    })
}

// ---------------------------------------------------------------- Resumo

/// Totais do mês (`aaaa-mm`), histórico dos últimos meses e despesas por categoria.
pub fn get_overview(db: &Database, month: &str) -> AppResult<FinanceOverview> {
    let month = YearMonth::parse(month)?;
    let range = DateRange::month(month);
    let history_range = DateRange {
        from: month.add_months(1 - HISTORY_MONTHS).first_day(),
        to: range.to,
    };
    db.with_connection(|connection| {
        let totals = PeriodTotals::from_rows(&finance_transactions::totals_by_kind_and_status(
            connection, range,
        )?);
        let history = build_history(
            month,
            &finance_transactions::totals_by_month(connection, history_range)?,
        );
        Ok(FinanceOverview {
            month: month.to_string(),
            totals,
            history,
            expenses_by_category: finance_transactions::expenses_by_category(connection, range)?,
        })
    })
}

// ---------------------------------------------------------------- Apoio

/// Executa a exclusão e o registro de sucesso na mesma transação. Em caso de
/// erro, registra a falha (melhor esforço: o erro original é o relevante).
fn delete_with_audit(
    connection: &mut Connection,
    action: &str,
    id: i64,
    delete: impl FnOnce(&Connection) -> AppResult<Value>,
) -> AppResult<()> {
    let target = id.to_string();
    let result = delete_and_record(connection, action, &target, delete);
    if let Err(error) = &result {
        let _ = audit::record(
            connection,
            &audit_entry(
                action,
                &target,
                AuditOutcome::Failure,
                json!({ "error": error.to_string() }),
            ),
        );
    }
    result
}

fn delete_and_record(
    connection: &mut Connection,
    action: &str,
    target: &str,
    delete: impl FnOnce(&Connection) -> AppResult<Value>,
) -> AppResult<()> {
    let transaction = connection.transaction()?;
    let details = delete(&transaction)?;
    audit::record(
        &transaction,
        &audit_entry(action, target, AuditOutcome::Success, details),
    )?;
    transaction.commit()?;
    Ok(())
}

fn audit_entry<'a>(
    action: &'a str,
    target: &'a str,
    outcome: AuditOutcome,
    details: Value,
) -> NewAuditEntry<'a> {
    NewAuditEntry {
        category: AuditCategory::Finance,
        action,
        target: Some(target),
        outcome,
        details: Some(details),
    }
}

fn load_account(connection: &Connection, id: i64) -> AppResult<FinanceAccount> {
    finance_accounts::find(connection, id)?.ok_or(AppError::NotFound(ACCOUNT_NOT_FOUND))
}

fn load_category(connection: &Connection, id: i64) -> AppResult<FinanceCategory> {
    finance_categories::find(connection, id)?.ok_or(AppError::NotFound(CATEGORY_NOT_FOUND))
}

fn load_transaction(connection: &Connection, id: i64) -> AppResult<Transaction> {
    finance_transactions::find(connection, id)?.ok_or(AppError::NotFound(TRANSACTION_NOT_FOUND))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::finance::accounts::AccountKind;
    use crate::domain::finance::TransactionKind;
    use crate::domain::task_categories::CategoryColor;

    fn account(name: &str) -> AccountInput {
        AccountInput {
            name: name.into(),
            kind: AccountKind::Checking,
            color: CategoryColor::Slate,
            opening_balance: 10_000,
        }
    }

    fn expense(account_id: i64, description: &str, amount: i64, date: &str) -> TransactionInput {
        TransactionInput {
            account_id,
            transfer_account_id: None,
            category_id: None,
            kind: TransactionKind::Expense,
            description: description.into(),
            amount,
            date: date.into(),
            status: TransactionStatus::Paid,
            notes: String::new(),
            tags: vec!["Casa".into()],
        }
    }

    fn audit_log(db: &Database) -> Vec<audit::AuditEntry> {
        db.with_connection(|connection| audit::list_recent(connection, 10))
            .unwrap()
    }

    #[test]
    fn creates_transactions_and_updates_the_balance() {
        let db = Database::open_in_memory().unwrap();
        let c6 = create_account(&db, account("C6")).unwrap();

        let created =
            create_transaction(&db, expense(c6.id, " Mercado ", 4_000, "2026-09-10")).unwrap();
        assert_eq!(created.description, "Mercado");
        assert_eq!(created.tags, vec!["casa"]);
        assert_eq!(list_accounts(&db).unwrap()[0].balance, 6_000);

        // Pendente não conta no saldo.
        set_transaction_status(&db, created.id, TransactionStatus::Pending).unwrap();
        assert_eq!(list_accounts(&db).unwrap()[0].balance, 10_000);

        let mut edited = expense(c6.id, "Mercado", 5_000, "2026-09-11");
        edited.status = TransactionStatus::Paid;
        let updated = update_transaction(&db, created.id, edited).unwrap();
        assert_eq!(
            (updated.amount, updated.date.as_str()),
            (5_000, "2026-09-11")
        );
        assert_eq!(
            list_transactions(&db, "2026-09-01", "2026-09-30")
                .unwrap()
                .len(),
            1
        );
        assert_eq!(list_tags(&db).unwrap(), vec!["casa"]);
        assert!(matches!(
            list_transactions(&db, "2026-01-01", "2027-06-30"),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn limits_accounts() {
        let db = Database::open_in_memory().unwrap();
        for index in 0..MAX_ACCOUNTS {
            create_account(&db, account(&format!("Conta {index}"))).unwrap();
        }
        assert!(matches!(
            create_account(&db, account("Uma a mais")),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn deletes_are_audited_on_success_and_failure() {
        let db = Database::open_in_memory().unwrap();
        let c6 = create_account(&db, account("C6")).unwrap();
        let nubank = create_account(&db, account("Nubank")).unwrap();
        let created =
            create_transaction(&db, expense(c6.id, "Cinema", 6_000, "2026-09-12")).unwrap();

        // Conta com lançamento: recusada e auditada como falha.
        assert!(matches!(
            delete_account(&db, c6.id),
            Err(AppError::Validation(_))
        ));
        delete_transaction(&db, created.id).unwrap();
        delete_account(&db, nubank.id).unwrap();

        let log = audit_log(&db);
        assert_eq!(log.len(), 3);
        assert!(log.iter().all(|entry| entry.category == "finance"));
        assert_eq!(log[2].action, ACTION_ACCOUNT_DELETED);
        assert_eq!(log[2].outcome, "failure");
        assert_eq!(log[1].action, ACTION_TRANSACTION_DELETED);
        assert_eq!(
            log[1].details,
            Some(json!({
                "title": "Cinema",
                "kind": "expense",
                "amount": 6_000,
                "date": "2026-09-12",
                "accountId": c6.id,
            }))
        );
        assert_eq!(
            log[0].details,
            Some(json!({ "name": "Nubank", "kind": "checking" }))
        );
        // Agora vazia, a conta pode ser excluída.
        delete_account(&db, c6.id).unwrap();
        assert!(list_accounts(&db).unwrap().is_empty());
    }

    #[test]
    fn category_lifecycle_is_audited() {
        let db = Database::open_in_memory().unwrap();
        let pets = create_category(
            &db,
            CategoryInput {
                kind: TransactionKind::Expense,
                name: "Pets".into(),
                color: CategoryColor::Amber,
            },
        )
        .unwrap();
        let renamed = update_category(
            &db,
            pets.id,
            CategoryUpdate {
                name: "Pets e veterinário".into(),
                color: CategoryColor::Pink,
            },
        )
        .unwrap();
        assert_eq!(renamed.kind, TransactionKind::Expense);

        delete_category(&db, pets.id).unwrap();
        let log = audit_log(&db);
        assert_eq!(log[0].action, ACTION_CATEGORY_DELETED);
        assert_eq!(
            log[0].details,
            Some(json!({
                "name": "Pets e veterinário",
                "kind": "expense",
                "transactionsDetached": 0,
            }))
        );
        assert_eq!(list_categories(&db).unwrap().len(), 14);
    }

    #[test]
    fn overview_sums_the_month_and_the_history() {
        let db = Database::open_in_memory().unwrap();
        let c6 = create_account(&db, account("C6")).unwrap();
        create_transaction(&db, expense(c6.id, "Mercado", 50_000, "2026-09-10")).unwrap();
        let mut rent = expense(c6.id, "Aluguel", 200_000, "2026-09-05");
        rent.status = TransactionStatus::Pending;
        create_transaction(&db, rent).unwrap();
        let mut salary = expense(c6.id, "Salário", 800_000, "2026-09-05");
        salary.kind = TransactionKind::Income;
        create_transaction(&db, salary).unwrap();
        create_transaction(&db, expense(c6.id, "Abril", 1_000, "2026-04-30")).unwrap();
        create_transaction(&db, expense(c6.id, "Março", 1_000, "2026-03-31")).unwrap();

        let overview = get_overview(&db, "2026-09").unwrap();
        assert_eq!(overview.month, "2026-09");
        assert_eq!(
            overview.totals,
            PeriodTotals {
                income: 800_000,
                income_pending: 0,
                expenses: 250_000,
                expenses_pending: 200_000,
            }
        );
        assert_eq!(overview.history.len(), 6);
        assert_eq!(overview.history[0].month, "2026-04");
        assert_eq!(overview.history[0].expenses, 1_000);
        assert_eq!(overview.expenses_by_category.len(), 1);
        assert_eq!(overview.expenses_by_category[0].total, 250_000);
        assert!(matches!(
            get_overview(&db, "2026-13"),
            Err(AppError::Validation(_))
        ));
    }
}
