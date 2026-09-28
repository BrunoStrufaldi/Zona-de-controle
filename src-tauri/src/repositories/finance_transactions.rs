//! Acesso às tabelas `finance_transactions` e `finance_transaction_tags`, e às
//! somas usadas nos resumos do período.

use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::domain::finance::overview::CategoryTotal;
use crate::domain::finance::period::DateRange;
use crate::domain::finance::transactions::{
    Installment, Transaction, TransactionStatus, ValidTransaction,
};
use crate::domain::finance::TransactionKind;
use crate::error::{AppError, AppResult};
use crate::repositories::{finance_accounts, finance_categories};

pub const TRANSACTION_NOT_FOUND: &str = "lançamento não encontrado";

const SELECT_TRANSACTION: &str = "SELECT id, account_id, transfer_account_id, category_id, kind,
       description, amount, date, status, notes, purchase_date, installment_number,
       installment_count, external_id IS NOT NULL, created_at, updated_at
FROM finance_transactions";

/// Linha crua; tipo e status são convertidos fora do mapeamento para reportar
/// valores inválidos como `AppError`.
struct TransactionRow {
    id: i64,
    account_id: i64,
    transfer_account_id: Option<i64>,
    category_id: Option<i64>,
    kind: String,
    description: String,
    amount: i64,
    date: String,
    status: String,
    notes: String,
    purchase_date: Option<String>,
    installment_number: Option<u32>,
    installment_count: Option<u32>,
    imported: bool,
    created_at: String,
    updated_at: String,
}

impl TransactionRow {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            account_id: row.get(1)?,
            transfer_account_id: row.get(2)?,
            category_id: row.get(3)?,
            kind: row.get(4)?,
            description: row.get(5)?,
            amount: row.get(6)?,
            date: row.get(7)?,
            status: row.get(8)?,
            notes: row.get(9)?,
            purchase_date: row.get(10)?,
            installment_number: row.get(11)?,
            installment_count: row.get(12)?,
            imported: row.get(13)?,
            created_at: row.get(14)?,
            updated_at: row.get(15)?,
        })
    }

    fn into_transaction(self, tags: Vec<String>) -> AppResult<Transaction> {
        Ok(Transaction {
            id: self.id,
            account_id: self.account_id,
            transfer_account_id: self.transfer_account_id,
            category_id: self.category_id,
            kind: TransactionKind::parse(&self.kind)?,
            description: self.description,
            amount: self.amount,
            date: self.date,
            status: TransactionStatus::parse(&self.status)?,
            notes: self.notes,
            tags,
            purchase_date: self.purchase_date,
            installment: match (self.installment_number, self.installment_count) {
                (Some(number), Some(count)) => Installment::new(number, count),
                _ => None,
            },
            imported: self.imported,
            created_at: self.created_at,
            updated_at: self.updated_at,
        })
    }
}

/// Lançamentos do intervalo, dos mais recentes para os mais antigos.
pub fn list(connection: &Connection, range: DateRange) -> AppResult<Vec<Transaction>> {
    let (from, to) = (range.from.to_string(), range.to.to_string());
    let mut statement = connection.prepare(&format!(
        "{SELECT_TRANSACTION} WHERE date BETWEEN ?1 AND ?2 ORDER BY date DESC, id DESC"
    ))?;
    let rows = statement
        .query_map([&from, &to], TransactionRow::from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut tags = tags_in_range(connection, &from, &to)?;
    rows.into_iter()
        .map(|row| {
            let row_tags = tags.remove(&row.id).unwrap_or_default();
            row.into_transaction(row_tags)
        })
        .collect()
}

pub fn find(connection: &Connection, id: i64) -> AppResult<Option<Transaction>> {
    let row = connection
        .query_row(
            &format!("{SELECT_TRANSACTION} WHERE id = ?1"),
            [id],
            TransactionRow::from_row,
        )
        .optional()?;
    match row {
        Some(row) => {
            let tags = tags_of(connection, id)?;
            Ok(Some(row.into_transaction(tags)?))
        }
        None => Ok(None),
    }
}

/// Retorna o id do novo lançamento. Importados guardam também a origem
/// (identificador, data da compra e parcela).
pub fn insert(connection: &Connection, transaction: &ValidTransaction) -> AppResult<i64> {
    ensure_references(connection, transaction)?;
    let imported = transaction.imported.as_ref();
    let installment = imported.and_then(|fields| fields.installment);
    connection.execute(
        "INSERT INTO finance_transactions
             (account_id, transfer_account_id, category_id, kind, description, amount, date,
              status, notes, purchase_date, installment_number, installment_count, external_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            transaction.account_id,
            transaction.transfer_account_id,
            transaction.category_id,
            transaction.kind.as_str(),
            transaction.description,
            transaction.amount,
            transaction.date.to_string(),
            transaction.status.as_str(),
            transaction.notes,
            imported
                .and_then(|fields| fields.purchase_date)
                .map(|date| date.to_string()),
            installment.map(|value| value.number),
            installment.map(|value| value.count),
            imported.map(|fields| fields.external_id.as_str()),
        ],
    )?;
    let id = connection.last_insert_rowid();
    replace_tags(connection, id, &transaction.tags)?;
    Ok(id)
}

/// Substitui os campos editáveis. A origem de um importado (identificador,
/// data da compra e parcela) nunca muda.
pub fn update(connection: &Connection, id: i64, transaction: &ValidTransaction) -> AppResult<()> {
    ensure_references(connection, transaction)?;
    let changed = connection.execute(
        "UPDATE finance_transactions
         SET account_id = ?2, transfer_account_id = ?3, category_id = ?4, kind = ?5,
             description = ?6, amount = ?7, date = ?8, status = ?9, notes = ?10,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        params![
            id,
            transaction.account_id,
            transaction.transfer_account_id,
            transaction.category_id,
            transaction.kind.as_str(),
            transaction.description,
            transaction.amount,
            transaction.date.to_string(),
            transaction.status.as_str(),
            transaction.notes
        ],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(TRANSACTION_NOT_FOUND));
    }
    replace_tags(connection, id, &transaction.tags)
}

pub fn set_status(connection: &Connection, id: i64, status: TransactionStatus) -> AppResult<()> {
    let changed = connection.execute(
        "UPDATE finance_transactions
         SET status = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        params![id, status.as_str()],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(TRANSACTION_NOT_FOUND));
    }
    Ok(())
}

/// Exclui o lançamento (as tags vinculadas saem em cascata). Retorna o excluído.
pub fn delete(connection: &Connection, id: i64) -> AppResult<Transaction> {
    let transaction = find(connection, id)?.ok_or(AppError::NotFound(TRANSACTION_NOT_FOUND))?;
    connection.execute("DELETE FROM finance_transactions WHERE id = ?1", [id])?;
    Ok(transaction)
}

/// Quais destes identificadores de origem já foram importados.
pub fn existing_external_ids(
    connection: &Connection,
    external_ids: &[&str],
) -> AppResult<HashSet<String>> {
    let mut statement =
        connection.prepare("SELECT 1 FROM finance_transactions WHERE external_id = ?1")?;
    let mut existing = HashSet::new();
    for id in external_ids {
        if statement.exists([id])? {
            existing.insert((*id).to_string());
        }
    }
    Ok(existing)
}

/// Tags em uso por algum lançamento, em ordem alfabética.
pub fn list_tags(connection: &Connection) -> AppResult<Vec<String>> {
    let mut statement = connection.prepare(
        "SELECT DISTINCT t.name FROM tags t
         JOIN finance_transaction_tags ft ON ft.tag_id = t.id
         ORDER BY t.name",
    )?;
    let tags = statement
        .query_map([], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    Ok(tags)
}

/// Somas do intervalo por tipo e status: `(tipo, status, total)`, sem as
/// transferências (só movem dinheiro entre contas).
pub fn totals_by_kind_and_status(
    connection: &Connection,
    range: DateRange,
) -> AppResult<Vec<(TransactionKind, TransactionStatus, i64)>> {
    let mut statement = connection.prepare(
        "SELECT kind, status, SUM(amount) FROM finance_transactions
         WHERE date BETWEEN ?1 AND ?2 AND kind != 'transfer'
         GROUP BY kind, status",
    )?;
    let rows = statement
        .query_map([range.from.to_string(), range.to.to_string()], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    rows.into_iter()
        .map(|(kind, status, total)| {
            Ok((
                TransactionKind::parse(&kind)?,
                TransactionStatus::parse(&status)?,
                total,
            ))
        })
        .collect()
}

/// Somas do intervalo por mês e tipo: `(aaaa-mm, tipo, total)`, sem transferências.
pub fn totals_by_month(
    connection: &Connection,
    range: DateRange,
) -> AppResult<Vec<(String, TransactionKind, i64)>> {
    let mut statement = connection.prepare(
        "SELECT substr(date, 1, 7), kind, SUM(amount) FROM finance_transactions
         WHERE date BETWEEN ?1 AND ?2 AND kind != 'transfer'
         GROUP BY 1, kind",
    )?;
    let rows = statement
        .query_map([range.from.to_string(), range.to.to_string()], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    rows.into_iter()
        .map(|(month, kind, total)| Ok((month, TransactionKind::parse(&kind)?, total)))
        .collect()
}

/// Despesas do intervalo por categoria, da maior para a menor.
pub fn expenses_by_category(
    connection: &Connection,
    range: DateRange,
) -> AppResult<Vec<CategoryTotal>> {
    let mut statement = connection.prepare(
        "SELECT category_id, SUM(amount) FROM finance_transactions
         WHERE kind = 'expense' AND date BETWEEN ?1 AND ?2
         GROUP BY category_id
         ORDER BY 2 DESC, category_id",
    )?;
    let totals = statement
        .query_map([range.from.to_string(), range.to.to_string()], |row| {
            Ok(CategoryTotal {
                category_id: row.get(0)?,
                total: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(totals)
}

/// As contas precisam existir; a categoria (opcional) precisa existir e ser do
/// mesmo tipo do lançamento.
fn ensure_references(connection: &Connection, transaction: &ValidTransaction) -> AppResult<()> {
    if !finance_accounts::exists(connection, transaction.account_id)? {
        return Err(AppError::Validation("conta não encontrada".into()));
    }
    if let Some(target) = transaction.transfer_account_id {
        if !finance_accounts::exists(connection, target)? {
            return Err(AppError::Validation(
                "conta de destino não encontrada".into(),
            ));
        }
    }
    let Some(category_id) = transaction.category_id else {
        return Ok(());
    };
    match finance_categories::kind_of(connection, category_id)? {
        None => Err(AppError::Validation("categoria não encontrada".into())),
        Some(kind) if kind != transaction.kind => Err(AppError::Validation(match kind {
            TransactionKind::Income => "a categoria escolhida é de receita".into(),
            _ => "a categoria escolhida é de despesa".into(),
        })),
        Some(_) => Ok(()),
    }
}

fn tags_of(connection: &Connection, transaction_id: i64) -> AppResult<Vec<String>> {
    let mut statement = connection.prepare(
        "SELECT t.name FROM tags t
         JOIN finance_transaction_tags ft ON ft.tag_id = t.id
         WHERE ft.transaction_id = ?1
         ORDER BY t.name",
    )?;
    let tags = statement
        .query_map([transaction_id], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    Ok(tags)
}

/// Tags dos lançamentos do intervalo, por id do lançamento.
fn tags_in_range(
    connection: &Connection,
    from: &str,
    to: &str,
) -> AppResult<HashMap<i64, Vec<String>>> {
    let mut statement = connection.prepare(
        "SELECT ft.transaction_id, t.name FROM finance_transaction_tags ft
         JOIN tags t ON t.id = ft.tag_id
         JOIN finance_transactions f ON f.id = ft.transaction_id
         WHERE f.date BETWEEN ?1 AND ?2
         ORDER BY t.name",
    )?;
    let mut tags: HashMap<i64, Vec<String>> = HashMap::new();
    let rows = statement.query_map([from, to], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (id, name) = row?;
        tags.entry(id).or_default().push(name);
    }
    Ok(tags)
}

fn replace_tags(connection: &Connection, transaction_id: i64, tags: &[String]) -> AppResult<()> {
    connection.execute(
        "DELETE FROM finance_transaction_tags WHERE transaction_id = ?1",
        [transaction_id],
    )?;
    for name in tags {
        connection.execute(
            "INSERT INTO tags (name) VALUES (?1) ON CONFLICT (name) DO NOTHING",
            [name],
        )?;
        connection.execute(
            "INSERT INTO finance_transaction_tags (transaction_id, tag_id)
             SELECT ?1, id FROM tags WHERE name = ?2",
            params![transaction_id, name],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::domain::calendar::CalendarDate;
    use crate::domain::finance::period::YearMonth;

    fn valid(
        description: &str,
        kind: TransactionKind,
        amount: i64,
        date: &str,
    ) -> ValidTransaction {
        ValidTransaction {
            account_id: 1,
            transfer_account_id: None,
            category_id: None,
            kind,
            description: description.into(),
            amount,
            date: CalendarDate::parse(date).unwrap(),
            status: TransactionStatus::Paid,
            notes: String::new(),
            tags: Vec::new(),
            imported: None,
        }
    }

    fn with_account(test: impl FnOnce(&Connection) -> AppResult<()>) {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| {
            connection.execute(
                "INSERT INTO finance_accounts (name, kind, color) VALUES ('C6', 'checking', 'slate')",
                [],
            )?;
            test(connection)
        })
        .unwrap();
    }

    fn category_id(connection: &Connection, kind: &str, name: &str) -> i64 {
        connection
            .query_row(
                "SELECT id FROM finance_categories WHERE kind = ?1 AND name = ?2",
                [kind, name],
                |row| row.get(0),
            )
            .unwrap()
    }

    fn september() -> DateRange {
        DateRange::month(YearMonth::parse("2026-09").unwrap())
    }

    #[test]
    fn inserts_lists_by_range_and_updates() {
        with_account(|connection| {
            let mut market = valid("Mercado", TransactionKind::Expense, 45_000, "2026-09-10");
            market.tags = vec!["casa".into(), "essencial".into()];
            let id = insert(connection, &market)?;
            insert(
                connection,
                &valid("Salário", TransactionKind::Income, 800_000, "2026-09-05"),
            )?;
            insert(
                connection,
                &valid("Outubro", TransactionKind::Expense, 1_000, "2026-10-01"),
            )?;

            let listed = list(connection, september())?;
            let descriptions: Vec<_> = listed.iter().map(|t| t.description.as_str()).collect();
            assert_eq!(descriptions, vec!["Mercado", "Salário"]);
            assert_eq!(listed[0].tags, vec!["casa", "essencial"]);
            assert_eq!(listed[0].amount, 45_000);

            market.amount = 47_500;
            market.tags = vec!["mercado".into()];
            update(connection, id, &market)?;
            let updated = find(connection, id)?.unwrap();
            assert_eq!(
                (updated.amount, updated.tags),
                (47_500, vec!["mercado".to_string()])
            );
            assert_eq!(list_tags(connection)?, vec!["mercado"]);

            set_status(connection, id, TransactionStatus::Pending)?;
            assert_eq!(
                find(connection, id)?.unwrap().status,
                TransactionStatus::Pending
            );
            assert!(matches!(
                set_status(connection, 99, TransactionStatus::Paid),
                Err(AppError::NotFound(_))
            ));
            Ok(())
        });
    }

    #[test]
    fn checks_account_and_category_kind() {
        with_account(|connection| {
            let mut transaction = valid("Mercado", TransactionKind::Expense, 100, "2026-09-10");
            transaction.account_id = 42;
            assert!(matches!(
                insert(connection, &transaction),
                Err(AppError::Validation(_))
            ));

            transaction.account_id = 1;
            transaction.category_id = Some(category_id(connection, "income", "Salário"));
            assert!(matches!(
                insert(connection, &transaction),
                Err(AppError::Validation(_))
            ));

            transaction.category_id = Some(category_id(connection, "expense", "Alimentação"));
            assert!(insert(connection, &transaction).is_ok());
            transaction.category_id = Some(9_999);
            assert!(matches!(
                insert(connection, &transaction),
                Err(AppError::Validation(_))
            ));
            Ok(())
        });
    }

    #[test]
    fn delete_returns_the_removed_transaction() {
        with_account(|connection| {
            let mut transaction = valid("Cinema", TransactionKind::Expense, 6_000, "2026-09-12");
            transaction.tags = vec!["lazer".into()];
            let id = insert(connection, &transaction)?;

            assert_eq!(delete(connection, id)?.description, "Cinema");
            assert!(matches!(delete(connection, id), Err(AppError::NotFound(_))));
            let links: i64 = connection.query_row(
                "SELECT COUNT(*) FROM finance_transaction_tags",
                [],
                |row| row.get(0),
            )?;
            assert_eq!(links, 0);
            Ok(())
        });
    }

    #[test]
    fn sums_by_status_month_and_category() {
        with_account(|connection| {
            let food = category_id(connection, "expense", "Alimentação");
            let home = category_id(connection, "expense", "Moradia");
            let mut rent = valid("Aluguel", TransactionKind::Expense, 200_000, "2026-09-05");
            rent.category_id = Some(home);
            rent.status = TransactionStatus::Pending;
            insert(connection, &rent)?;
            let mut market = valid("Mercado", TransactionKind::Expense, 50_000, "2026-09-10");
            market.category_id = Some(food);
            insert(connection, &market)?;
            insert(
                connection,
                &valid("Farmácia", TransactionKind::Expense, 3_000, "2026-09-11"),
            )?;
            insert(
                connection,
                &valid("Salário", TransactionKind::Income, 800_000, "2026-09-05"),
            )?;
            insert(
                connection,
                &valid("Agosto", TransactionKind::Income, 700_000, "2026-08-05"),
            )?;

            let mut totals = totals_by_kind_and_status(connection, september())?;
            totals.sort_by_key(|(kind, status, _)| (kind.as_str(), status.as_str()));
            assert_eq!(
                totals,
                vec![
                    (TransactionKind::Expense, TransactionStatus::Paid, 53_000),
                    (
                        TransactionKind::Expense,
                        TransactionStatus::Pending,
                        200_000
                    ),
                    (TransactionKind::Income, TransactionStatus::Paid, 800_000),
                ]
            );

            let range = DateRange::parse("2026-08-01", "2026-09-30")?;
            let mut months = totals_by_month(connection, range)?;
            months.sort_by(|a, b| (&a.0, a.1.as_str()).cmp(&(&b.0, b.1.as_str())));
            assert_eq!(
                months,
                vec![
                    ("2026-08".to_string(), TransactionKind::Income, 700_000),
                    ("2026-09".to_string(), TransactionKind::Expense, 253_000),
                    ("2026-09".to_string(), TransactionKind::Income, 800_000),
                ]
            );

            let by_category = expenses_by_category(connection, september())?;
            assert_eq!(
                by_category,
                vec![
                    CategoryTotal {
                        category_id: Some(home),
                        total: 200_000
                    },
                    CategoryTotal {
                        category_id: Some(food),
                        total: 50_000
                    },
                    CategoryTotal {
                        category_id: None,
                        total: 3_000
                    },
                ]
            );
            Ok(())
        });
    }
}
