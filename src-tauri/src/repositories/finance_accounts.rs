//! Acesso à tabela `finance_accounts` (saldos calculados a partir dos lançamentos).

use rusqlite::{params, Connection};

use crate::domain::finance::accounts::{AccountKind, FinanceAccount, ValidAccount};
use crate::domain::task_categories::CategoryColor;
use crate::error::{AppError, AppResult};

pub const ACCOUNT_NOT_FOUND: &str = "conta não encontrada";

/// Contas em ordem alfabética, com saldo (só lançamentos pagos) e contagem.
pub fn list(connection: &Connection) -> AppResult<Vec<FinanceAccount>> {
    let mut statement = connection.prepare(
        // Na transferência o dinheiro sai de `account_id` e entra em `transfer_account_id`.
        "SELECT a.id, a.name, a.kind, a.color, a.opening_balance,
                a.opening_balance + COALESCE(SUM(
                    CASE WHEN t.status != 'paid' THEN 0
                         WHEN t.transfer_account_id = a.id THEN t.amount
                         WHEN t.kind = 'income' THEN t.amount
                         ELSE -t.amount END), 0),
                COUNT(t.id), a.closing_day, a.due_day
         FROM finance_accounts a
         LEFT JOIN finance_transactions t
                ON t.account_id = a.id OR t.transfer_account_id = a.id
         GROUP BY a.id
         ORDER BY a.name COLLATE NOCASE, a.id",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, u32>(6)?,
                row.get::<_, Option<u32>>(7)?,
                row.get::<_, Option<u32>>(8)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    rows.into_iter()
        .map(
            |(id, name, kind, color, opening_balance, balance, transaction_count, closing, due)| {
                Ok(FinanceAccount {
                    id,
                    name,
                    kind: AccountKind::parse(&kind)?,
                    color: CategoryColor::parse(&color)?,
                    opening_balance,
                    balance,
                    transaction_count,
                    closing_day: closing,
                    due_day: due,
                })
            },
        )
        .collect()
}

pub fn find(connection: &Connection, id: i64) -> AppResult<Option<FinanceAccount>> {
    Ok(list(connection)?
        .into_iter()
        .find(|account| account.id == id))
}

pub fn count(connection: &Connection) -> AppResult<usize> {
    let count: i64 = connection.query_row("SELECT COUNT(*) FROM finance_accounts", [], |row| {
        row.get(0)
    })?;
    Ok(count as usize)
}

pub fn exists(connection: &Connection, id: i64) -> AppResult<bool> {
    Ok(connection.query_row(
        "SELECT EXISTS (SELECT 1 FROM finance_accounts WHERE id = ?1)",
        [id],
        |row| row.get(0),
    )?)
}

/// Retorna o id da nova conta.
pub fn insert(connection: &Connection, account: &ValidAccount) -> AppResult<i64> {
    ensure_unique_name(connection, &account.name, None)?;
    connection.execute(
        "INSERT INTO finance_accounts (name, kind, color, opening_balance, closing_day, due_day)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            account.name,
            account.kind.as_str(),
            account.color.as_str(),
            account.opening_balance,
            account.card_cycle.map(|cycle| cycle.closing_day),
            account.card_cycle.map(|cycle| cycle.due_day),
        ],
    )?;
    Ok(connection.last_insert_rowid())
}

pub fn update(connection: &Connection, id: i64, account: &ValidAccount) -> AppResult<()> {
    ensure_unique_name(connection, &account.name, Some(id))?;
    let changed = connection.execute(
        "UPDATE finance_accounts
         SET name = ?2, kind = ?3, color = ?4, opening_balance = ?5, closing_day = ?6,
             due_day = ?7, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        params![
            id,
            account.name,
            account.kind.as_str(),
            account.color.as_str(),
            account.opening_balance,
            account.card_cycle.map(|cycle| cycle.closing_day),
            account.card_cycle.map(|cycle| cycle.due_day),
        ],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(ACCOUNT_NOT_FOUND));
    }
    Ok(())
}

/// Exclui uma conta sem lançamentos, recorrentes nem investimentos. Retorna a conta excluída.
pub fn delete(connection: &Connection, id: i64) -> AppResult<FinanceAccount> {
    let account = find(connection, id)?.ok_or(AppError::NotFound(ACCOUNT_NOT_FOUND))?;
    if account.transaction_count > 0 {
        return Err(AppError::Validation(format!(
            "a conta “{}” tem lançamentos; exclua-os ou mude-os de conta antes",
            account.name
        )));
    }
    let recurring: i64 = connection.query_row(
        "SELECT COUNT(*) FROM finance_recurring WHERE account_id = ?1 OR transfer_account_id = ?1",
        [id],
        |row| row.get(0),
    )?;
    if recurring > 0 {
        return Err(AppError::Validation(format!(
            "a conta “{}” é usada por recorrentes; exclua-as ou mude-as de conta antes",
            account.name
        )));
    }
    if crate::repositories::investments::account_has_assets(connection, id)? {
        return Err(AppError::Validation(format!(
            "a conta “{}” guarda investimentos; exclua-os ou mude-os de conta antes",
            account.name
        )));
    }
    connection.execute("DELETE FROM finance_accounts WHERE id = ?1", [id])?;
    Ok(account)
}

/// Nomes únicos sem diferenciar maiúsculas (inclusive letras acentuadas,
/// que o `COLLATE NOCASE` do SQLite não cobre).
fn ensure_unique_name(
    connection: &Connection,
    name: &str,
    except_id: Option<i64>,
) -> AppResult<()> {
    let wanted = name.to_lowercase();
    let mut statement = connection.prepare("SELECT id, name FROM finance_accounts")?;
    let clash = statement
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?
        .into_iter()
        .any(|(id, existing)| Some(id) != except_id && existing.to_lowercase() == wanted);
    if clash {
        return Err(AppError::Validation(format!(
            "já existe uma conta chamada “{name}”"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn valid(name: &str, opening_balance: i64) -> ValidAccount {
        ValidAccount {
            name: name.into(),
            kind: AccountKind::Checking,
            color: CategoryColor::Slate,
            opening_balance,
            card_cycle: None,
        }
    }

    fn with_db(test: impl FnOnce(&Connection) -> AppResult<()>) {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| test(connection)).unwrap();
    }

    fn add_transaction(
        connection: &Connection,
        account: i64,
        kind: &str,
        amount: i64,
        status: &str,
    ) {
        connection
            .execute(
                "INSERT INTO finance_transactions (account_id, kind, description, amount, date, status)
                 VALUES (?1, ?2, 'x', ?3, '2026-09-28', ?4)",
                params![account, kind, amount, status],
            )
            .unwrap();
    }

    #[test]
    fn balance_counts_only_paid_transactions() {
        with_db(|connection| {
            let c6 = insert(connection, &valid("C6", 100_000))?;
            insert(connection, &valid("Carteira", 0))?;
            add_transaction(connection, c6, "income", 500_000, "paid");
            add_transaction(connection, c6, "expense", 120_000, "paid");
            add_transaction(connection, c6, "expense", 999_999, "pending");

            let accounts = list(connection)?;
            let names: Vec<_> = accounts.iter().map(|a| a.name.as_str()).collect();
            assert_eq!(names, vec!["C6", "Carteira"]);
            assert_eq!(accounts[0].balance, 480_000);
            assert_eq!(accounts[0].transaction_count, 3);
            assert_eq!(accounts[1].balance, 0);
            assert_eq!(count(connection)?, 2);
            assert!(exists(connection, c6)? && !exists(connection, 99)?);
            Ok(())
        });
    }

    #[test]
    fn rejects_duplicate_names_ignoring_case() {
        with_db(|connection| {
            let id = insert(connection, &valid("Poupança", 0))?;
            assert!(matches!(
                insert(connection, &valid("POUPANÇA", 0)),
                Err(AppError::Validation(_))
            ));
            update(connection, id, &valid("poupança", 5_000))?;
            assert_eq!(find(connection, id)?.unwrap().opening_balance, 5_000);
            assert!(matches!(
                update(connection, 99, &valid("Outra", 0)),
                Err(AppError::NotFound(_))
            ));
            Ok(())
        });
    }

    #[test]
    fn deletes_only_empty_accounts() {
        with_db(|connection| {
            let used = insert(connection, &valid("C6", 0))?;
            let empty = insert(connection, &valid("Nubank", 0))?;
            add_transaction(connection, used, "expense", 1_000, "paid");

            assert!(matches!(
                delete(connection, used),
                Err(AppError::Validation(_))
            ));
            assert_eq!(delete(connection, empty)?.name, "Nubank");
            assert!(matches!(
                delete(connection, empty),
                Err(AppError::NotFound(_))
            ));
            assert_eq!(count(connection)?, 1);
            Ok(())
        });
    }

    #[test]
    fn transfers_move_money_between_accounts() {
        with_db(|connection| {
            let checking = insert(connection, &valid("C6", 500_000))?;
            let card = insert(connection, &valid("Cartão C6", -120_000))?;
            let transfer = |amount: i64, status: &str| {
                connection
                    .execute(
                        "INSERT INTO finance_transactions
                             (account_id, transfer_account_id, kind, description, amount, date, status)
                         VALUES (?1, ?2, 'transfer', 'Fatura', ?3, '2026-09-10', ?4)",
                        params![checking, card, amount, status],
                    )
                    .unwrap();
            };
            transfer(120_000, "paid");
            transfer(999, "pending");

            let accounts = list(connection)?;
            let balance = |id| accounts.iter().find(|a| a.id == id).unwrap().balance;
            assert_eq!(balance(checking), 380_000);
            assert_eq!(balance(card), 0);
            // A transferência conta nas duas contas, que não podem ser excluídas.
            assert!(accounts.iter().all(|a| a.transaction_count == 2));
            assert!(matches!(
                delete(connection, card),
                Err(AppError::Validation(_))
            ));
            Ok(())
        });
    }
}
