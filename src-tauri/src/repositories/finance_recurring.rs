//! Acesso às tabelas `finance_recurring` (séries) e
//! `finance_recurring_occurrences` (vencimentos vinculados ou pulados).

use std::collections::{BTreeMap, HashMap};

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::domain::calendar::CalendarDate;
use crate::domain::finance::cards::CardCycle;
use crate::domain::finance::recurring::{
    RecurringRule, Resolution, Schedule, Series, ValidRecurring,
};
use crate::domain::finance::transactions::TransactionStatus;
use crate::domain::finance::TransactionKind;
use crate::error::{AppError, AppResult};
use crate::repositories::finance_transactions;

pub const RECURRING_NOT_FOUND: &str = "recorrente não encontrada";
pub const OCCURRENCE_NOT_FOUND: &str = "vencimento não encontrado";

const SELECT_SERIES: &str = "SELECT r.id, r.kind, r.description, r.amount, r.account_id,
       r.transfer_account_id, r.category_id, r.start_date, r.recurrence, r.notes, r.import_key,
       r.created_at, r.updated_at, a.kind = 'credit_card', a.closing_day, a.due_day
FROM finance_recurring r
JOIN finance_accounts a ON a.id = r.account_id";

/// Linha crua; tipo, data e regra são convertidos fora do mapeamento para
/// reportar valores inválidos como `AppError`.
struct SeriesRow {
    id: i64,
    kind: String,
    description: String,
    amount: i64,
    account_id: i64,
    transfer_account_id: Option<i64>,
    category_id: Option<i64>,
    start_date: String,
    recurrence: String,
    notes: String,
    import_key: Option<String>,
    created_at: String,
    updated_at: String,
    on_card: bool,
    closing_day: Option<u32>,
    due_day: Option<u32>,
}

impl SeriesRow {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            kind: row.get(1)?,
            description: row.get(2)?,
            amount: row.get(3)?,
            account_id: row.get(4)?,
            transfer_account_id: row.get(5)?,
            category_id: row.get(6)?,
            start_date: row.get(7)?,
            recurrence: row.get(8)?,
            notes: row.get(9)?,
            import_key: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
            on_card: row.get(13)?,
            closing_day: row.get(14)?,
            due_day: row.get(15)?,
        })
    }

    fn into_series(self, resolved: BTreeMap<CalendarDate, Resolution>) -> AppResult<Series> {
        let start = CalendarDate::parse(&self.start_date).ok_or_else(|| {
            AppError::Validation(format!("data inválida no banco: {}", self.start_date))
        })?;
        let rule: RecurringRule = serde_json::from_str(&self.recurrence).map_err(|error| {
            AppError::Validation(format!("repetição inválida no banco: {error}"))
        })?;
        Ok(Series {
            id: self.id,
            kind: TransactionKind::parse(&self.kind)?,
            description: self.description,
            amount: self.amount,
            account_id: self.account_id,
            transfer_account_id: self.transfer_account_id,
            category_id: self.category_id,
            schedule: Schedule::new(start, rule)?,
            notes: self.notes,
            import_key: self.import_key,
            on_card: self.on_card,
            card_cycle: CardCycle::from_days(self.closing_day, self.due_day)?,
            created_at: self.created_at,
            updated_at: self.updated_at,
            resolved,
        })
    }
}

/// Todas as séries com os vencimentos resolvidos.
pub fn list(connection: &Connection) -> AppResult<Vec<Series>> {
    let mut statement = connection.prepare(&format!("{SELECT_SERIES} ORDER BY r.id"))?;
    let rows = statement
        .query_map([], SeriesRow::from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut resolved = resolutions(connection, None)?;
    rows.into_iter()
        .map(|row| {
            let own = resolved.remove(&row.id).unwrap_or_default();
            row.into_series(own)
        })
        .collect()
}

pub fn find(connection: &Connection, id: i64) -> AppResult<Option<Series>> {
    let row = connection
        .query_row(
            &format!("{SELECT_SERIES} WHERE r.id = ?1"),
            [id],
            SeriesRow::from_row,
        )
        .optional()?;
    match row {
        Some(row) => {
            let own = resolutions(connection, Some(id))?
                .remove(&id)
                .unwrap_or_default();
            Ok(Some(row.into_series(own)?))
        }
        None => Ok(None),
    }
}

pub fn count(connection: &Connection) -> AppResult<usize> {
    let count: i64 = connection.query_row("SELECT COUNT(*) FROM finance_recurring", [], |row| {
        row.get(0)
    })?;
    Ok(count as usize)
}

/// Retorna o id da nova série.
pub fn insert(connection: &Connection, series: &ValidRecurring) -> AppResult<i64> {
    ensure_references(connection, series)?;
    connection.execute(
        "INSERT INTO finance_recurring
             (kind, description, amount, account_id, transfer_account_id, category_id,
              start_date, recurrence, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            series.kind.as_str(),
            series.description,
            series.amount,
            series.account_id,
            series.transfer_account_id,
            series.category_id,
            series.schedule.start.to_string(),
            rule_json(series)?,
            series.notes,
        ],
    )?;
    Ok(connection.last_insert_rowid())
}

/// Substitui os dados da série (os vencimentos resolvidos continuam).
pub fn update(connection: &Connection, id: i64, series: &ValidRecurring) -> AppResult<()> {
    ensure_references(connection, series)?;
    let changed = connection.execute(
        "UPDATE finance_recurring
         SET kind = ?2, description = ?3, amount = ?4, account_id = ?5,
             transfer_account_id = ?6, category_id = ?7, start_date = ?8, recurrence = ?9,
             notes = ?10, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        params![
            id,
            series.kind.as_str(),
            series.description,
            series.amount,
            series.account_id,
            series.transfer_account_id,
            series.category_id,
            series.schedule.start.to_string(),
            rule_json(series)?,
            series.notes,
        ],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(RECURRING_NOT_FOUND));
    }
    Ok(())
}

/// Exclui a série (os vínculos saem em cascata; os lançamentos continuam).
/// Retorna a série excluída.
pub fn delete(connection: &Connection, id: i64) -> AppResult<Series> {
    let series = find(connection, id)?.ok_or(AppError::NotFound(RECURRING_NOT_FOUND))?;
    connection.execute("DELETE FROM finance_recurring WHERE id = ?1", [id])?;
    Ok(series)
}

/// Vincula o vencimento a um lançamento.
pub fn link(
    connection: &Connection,
    id: i64,
    occurrence_date: CalendarDate,
    transaction_id: i64,
) -> AppResult<()> {
    if is_linked(connection, transaction_id)? {
        return Err(AppError::Validation(
            "este lançamento já está vinculado a um vencimento".into(),
        ));
    }
    connection.execute(
        "INSERT INTO finance_recurring_occurrences (recurring_id, occurrence_date, transaction_id)
         VALUES (?1, ?2, ?3)",
        params![id, occurrence_date.to_string(), transaction_id],
    )?;
    Ok(())
}

/// Marca o vencimento como pulado (sem lançamento).
pub fn skip(connection: &Connection, id: i64, occurrence_date: CalendarDate) -> AppResult<()> {
    connection.execute(
        "INSERT INTO finance_recurring_occurrences (recurring_id, occurrence_date)
         VALUES (?1, ?2)",
        params![id, occurrence_date.to_string()],
    )?;
    Ok(())
}

/// Desfaz o vínculo ou o pulo: o vencimento volta a ficar em aberto (o
/// lançamento vinculado continua existindo).
pub fn reopen(connection: &Connection, id: i64, occurrence_date: CalendarDate) -> AppResult<()> {
    let changed = connection.execute(
        "DELETE FROM finance_recurring_occurrences
         WHERE recurring_id = ?1 AND occurrence_date = ?2",
        params![id, occurrence_date.to_string()],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(OCCURRENCE_NOT_FOUND));
    }
    Ok(())
}

/// Guarda a chave da descrição do extrato vinculado (sugestões futuras).
pub fn set_import_key(connection: &Connection, id: i64, key: &str) -> AppResult<()> {
    connection.execute(
        "UPDATE finance_recurring SET import_key = ?2 WHERE id = ?1",
        params![id, key],
    )?;
    Ok(())
}

pub fn is_linked(connection: &Connection, transaction_id: i64) -> AppResult<bool> {
    Ok(connection.query_row(
        "SELECT EXISTS (SELECT 1 FROM finance_recurring_occurrences WHERE transaction_id = ?1)",
        [transaction_id],
        |row| row.get(0),
    )?)
}

fn ensure_references(connection: &Connection, series: &ValidRecurring) -> AppResult<()> {
    finance_transactions::check_references(
        connection,
        series.kind,
        series.account_id,
        series.transfer_account_id,
        series.category_id,
    )
}

fn rule_json(series: &ValidRecurring) -> AppResult<String> {
    serde_json::to_string(&series.schedule.rule())
        .map_err(|error| AppError::Validation(format!("repetição inválida: {error}")))
}

/// Vencimentos resolvidos por série (de uma só, se `only` for dado).
fn resolutions(
    connection: &Connection,
    only: Option<i64>,
) -> AppResult<HashMap<i64, BTreeMap<CalendarDate, Resolution>>> {
    let mut statement = connection.prepare(
        "SELECT o.recurring_id, o.occurrence_date, o.transaction_id, t.amount, t.date, t.status
         FROM finance_recurring_occurrences o
         LEFT JOIN finance_transactions t ON t.id = o.transaction_id
         WHERE ?1 IS NULL OR o.recurring_id = ?1",
    )?;
    let rows = statement
        .query_map([only], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<i64>>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut resolved: HashMap<i64, BTreeMap<CalendarDate, Resolution>> = HashMap::new();
    for (recurring_id, occurrence_date, transaction_id, amount, date, status) in rows {
        let occurrence_date = CalendarDate::parse(&occurrence_date).ok_or_else(|| {
            AppError::Validation(format!("data inválida no banco: {occurrence_date}"))
        })?;
        let resolution = match (transaction_id, amount, date, status) {
            (Some(transaction_id), Some(amount), Some(date), Some(status)) => Resolution::Linked {
                transaction_id,
                amount,
                date,
                status: TransactionStatus::parse(&status)?,
            },
            _ => Resolution::Skipped,
        };
        resolved
            .entry(recurring_id)
            .or_default()
            .insert(occurrence_date, resolution);
    }
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::domain::finance::transactions::ValidTransaction;
    use crate::domain::task_recurrence::RecurrenceFrequency;

    fn date(value: &str) -> CalendarDate {
        CalendarDate::parse(value).unwrap()
    }

    fn valid(description: &str, start: &str) -> ValidRecurring {
        ValidRecurring {
            kind: TransactionKind::Expense,
            description: description.into(),
            amount: 200_000,
            account_id: 1,
            transfer_account_id: None,
            category_id: None,
            schedule: Schedule::new(
                date(start),
                RecurringRule {
                    frequency: RecurrenceFrequency::Monthly,
                    interval: 1,
                    until: None,
                    count: Some(12),
                },
            )
            .unwrap(),
            notes: String::new(),
        }
    }

    fn transaction(connection: &Connection, amount: i64, status: TransactionStatus) -> i64 {
        finance_transactions::insert(
            connection,
            &ValidTransaction {
                account_id: 1,
                transfer_account_id: None,
                category_id: None,
                kind: TransactionKind::Expense,
                description: "Aluguel".into(),
                amount,
                date: date("2026-09-06"),
                status,
                notes: String::new(),
                tags: Vec::new(),
                imported: None,
            },
        )
        .unwrap()
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

    #[test]
    fn stores_series_with_their_rule() {
        with_account(|connection| {
            let id = insert(connection, &valid("Aluguel", "2026-09-05"))?;
            let stored = find(connection, id)?.unwrap();
            assert_eq!(stored.description, "Aluguel");
            assert_eq!(stored.schedule.rule().count, Some(12));
            assert_eq!(count(connection)?, 1);

            let mut changed = valid("Aluguel novo", "2026-10-10");
            changed.amount = 210_000;
            update(connection, id, &changed)?;
            let updated = find(connection, id)?.unwrap();
            assert_eq!(
                (updated.amount, updated.schedule.start),
                (210_000, date("2026-10-10"))
            );
            assert!(matches!(
                update(connection, 99, &changed),
                Err(AppError::NotFound(_))
            ));

            let mut orphan = valid("Sem conta", "2026-09-05");
            orphan.account_id = 42;
            assert!(matches!(
                insert(connection, &orphan),
                Err(AppError::Validation(_))
            ));
            Ok(())
        });
    }

    #[test]
    fn links_skips_and_reopens_occurrences() {
        with_account(|connection| {
            let id = insert(connection, &valid("Aluguel", "2026-09-05"))?;
            let paid = transaction(connection, 205_000, TransactionStatus::Paid);
            link(connection, id, date("2026-09-05"), paid)?;
            skip(connection, id, date("2026-10-05"))?;

            let series = &list(connection)?[0];
            assert_eq!(
                series.resolved.get(&date("2026-09-05")),
                Some(&Resolution::Linked {
                    transaction_id: paid,
                    amount: 205_000,
                    date: "2026-09-06".into(),
                    status: TransactionStatus::Paid,
                })
            );
            assert_eq!(
                series.resolved.get(&date("2026-10-05")),
                Some(&Resolution::Skipped)
            );
            // O mesmo lançamento não vincula dois vencimentos.
            assert!(is_linked(connection, paid)?);
            assert!(matches!(
                link(connection, id, date("2026-11-05"), paid),
                Err(AppError::Validation(_))
            ));

            reopen(connection, id, date("2026-10-05"))?;
            assert!(matches!(
                reopen(connection, id, date("2026-10-05")),
                Err(AppError::NotFound(_))
            ));
            // Excluir o lançamento reabre o vencimento; excluir a série mantém o lançamento.
            finance_transactions::delete(connection, paid)?;
            assert!(find(connection, id)?.unwrap().resolved.is_empty());

            let other = transaction(connection, 200_000, TransactionStatus::Pending);
            link(connection, id, date("2026-09-05"), other)?;
            set_import_key(connection, id, "desc:imobiliaria")?;
            let removed = delete(connection, id)?;
            assert_eq!(removed.import_key.as_deref(), Some("desc:imobiliaria"));
            assert!(finance_transactions::find(connection, other)?.is_some());
            assert!(!is_linked(connection, other)?);
            Ok(())
        });
    }

    #[test]
    fn transactions_know_their_series() {
        with_account(|connection| {
            let id = insert(connection, &valid("Aluguel", "2026-09-05"))?;
            let paid = transaction(connection, 200_000, TransactionStatus::Paid);
            assert_eq!(
                finance_transactions::find(connection, paid)?
                    .unwrap()
                    .recurring_id,
                None
            );
            link(connection, id, date("2026-09-05"), paid)?;
            assert_eq!(
                finance_transactions::find(connection, paid)?
                    .unwrap()
                    .recurring_id,
                Some(id)
            );
            Ok(())
        });
    }
}
