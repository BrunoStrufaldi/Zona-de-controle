//! Acesso às tabelas `investment_assets`, `investment_movements` e
//! `investment_valuations`.

use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::domain::calendar::CalendarDate;
use crate::domain::finance::accounts::AccountKind;
use crate::domain::finance::investments::{
    Asset, AssetClass, AssetHistory, Movement, MovementKind, UnlinkedTransfer, ValidAsset,
    Valuation,
};
use crate::error::{AppError, AppResult};
use crate::repositories::finance_accounts;

pub const ASSET_NOT_FOUND: &str = "ativo não encontrado";
pub const MOVEMENT_NOT_FOUND: &str = "movimentação não encontrada";
pub const VALUATION_NOT_FOUND: &str = "valor informado não encontrado";

const SELECT_ASSET: &str = "SELECT id, account_id, class, name, ticker, maturity_date, notes,
       created_at, updated_at
FROM investment_assets";

const SELECT_MOVEMENT: &str =
    "SELECT id, asset_id, kind, date, amount, quantity, transaction_id, notes
FROM investment_movements";

fn parse_date(value: &str) -> AppResult<CalendarDate> {
    CalendarDate::parse(value)
        .ok_or_else(|| AppError::Validation(format!("data inválida no banco: {value}")))
}

/// Linha crua; classe e datas são convertidas fora do mapeamento para
/// reportar valores inválidos como `AppError`.
struct AssetRow {
    id: i64,
    account_id: i64,
    class: String,
    name: String,
    ticker: Option<String>,
    maturity_date: Option<String>,
    notes: String,
    created_at: String,
    updated_at: String,
}

impl AssetRow {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            account_id: row.get(1)?,
            class: row.get(2)?,
            name: row.get(3)?,
            ticker: row.get(4)?,
            maturity_date: row.get(5)?,
            notes: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    }

    fn into_asset(self) -> AppResult<Asset> {
        Ok(Asset {
            id: self.id,
            account_id: self.account_id,
            class: AssetClass::parse(&self.class)?,
            name: self.name,
            ticker: self.ticker,
            maturity_date: self.maturity_date.as_deref().map(parse_date).transpose()?,
            notes: self.notes,
            created_at: self.created_at,
            updated_at: self.updated_at,
        })
    }
}

struct MovementRow {
    id: i64,
    asset_id: i64,
    kind: String,
    date: String,
    amount: i64,
    quantity: Option<i64>,
    transaction_id: Option<i64>,
    notes: String,
}

impl MovementRow {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            asset_id: row.get(1)?,
            kind: row.get(2)?,
            date: row.get(3)?,
            amount: row.get(4)?,
            quantity: row.get(5)?,
            transaction_id: row.get(6)?,
            notes: row.get(7)?,
        })
    }

    fn into_movement(self) -> AppResult<Movement> {
        Ok(Movement {
            id: self.id,
            asset_id: self.asset_id,
            kind: MovementKind::parse(&self.kind)?,
            date: parse_date(&self.date)?,
            amount: self.amount,
            quantity: self.quantity,
            transaction_id: self.transaction_id,
            notes: self.notes,
        })
    }
}

// ---------------------------------------------------------------- Ativos

pub fn list_assets(connection: &Connection) -> AppResult<Vec<Asset>> {
    let mut statement = connection.prepare(&format!("{SELECT_ASSET} ORDER BY id"))?;
    let rows = statement
        .query_map([], AssetRow::from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    rows.into_iter().map(AssetRow::into_asset).collect()
}

pub fn find_asset(connection: &Connection, id: i64) -> AppResult<Option<Asset>> {
    connection
        .query_row(
            &format!("{SELECT_ASSET} WHERE id = ?1"),
            [id],
            AssetRow::from_row,
        )
        .optional()?
        .map(AssetRow::into_asset)
        .transpose()
}

pub fn count_assets(connection: &Connection) -> AppResult<usize> {
    let count: i64 = connection.query_row("SELECT COUNT(*) FROM investment_assets", [], |row| {
        row.get(0)
    })?;
    Ok(count as usize)
}

/// Retorna o id do novo ativo.
pub fn insert_asset(connection: &Connection, asset: &ValidAsset) -> AppResult<i64> {
    ensure_investment_account(connection, asset.account_id)?;
    connection.execute(
        "INSERT INTO investment_assets (account_id, class, name, ticker, maturity_date, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            asset.account_id,
            asset.class.as_str(),
            asset.name,
            asset.ticker,
            asset.maturity_date.map(|date| date.to_string()),
            asset.notes,
        ],
    )?;
    Ok(connection.last_insert_rowid())
}

pub fn update_asset(connection: &Connection, id: i64, asset: &ValidAsset) -> AppResult<()> {
    ensure_investment_account(connection, asset.account_id)?;
    let changed = connection.execute(
        "UPDATE investment_assets
         SET account_id = ?2, class = ?3, name = ?4, ticker = ?5, maturity_date = ?6, notes = ?7,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        params![
            id,
            asset.account_id,
            asset.class.as_str(),
            asset.name,
            asset.ticker,
            asset.maturity_date.map(|date| date.to_string()),
            asset.notes,
        ],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(ASSET_NOT_FOUND));
    }
    Ok(())
}

/// Ativo excluído, com quantas movimentações e valores informados saíram junto.
pub struct DeletedAsset {
    pub asset: Asset,
    pub movements: usize,
    pub valuations: usize,
}

/// Exclui o ativo (movimentações e valores saem em cascata; os lançamentos
/// vinculados continuam).
pub fn delete_asset(connection: &Connection, id: i64) -> AppResult<DeletedAsset> {
    let asset = find_asset(connection, id)?.ok_or(AppError::NotFound(ASSET_NOT_FOUND))?;
    let movements = list_movements(connection, Some(id))?.len();
    let valuations = list_valuations(connection, Some(id))?.len();
    connection.execute("DELETE FROM investment_assets WHERE id = ?1", [id])?;
    Ok(DeletedAsset {
        asset,
        movements,
        valuations,
    })
}

pub fn account_has_assets(connection: &Connection, account_id: i64) -> AppResult<bool> {
    Ok(connection.query_row(
        "SELECT EXISTS (SELECT 1 FROM investment_assets WHERE account_id = ?1)",
        [account_id],
        |row| row.get(0),
    )?)
}

/// A conta precisa existir e ser do tipo Investimentos.
fn ensure_investment_account(connection: &Connection, account_id: i64) -> AppResult<()> {
    match finance_accounts::find(connection, account_id)? {
        None => Err(AppError::Validation("conta não encontrada".into())),
        Some(account) if account.kind != AccountKind::Investment => {
            Err(AppError::Validation(format!(
                "a conta “{}” não é do tipo Investimentos; escolha uma conta de investimentos",
                account.name
            )))
        }
        Some(_) => Ok(()),
    }
}

// ---------------------------------------------------------------- Movimentações

/// Movimentações (de um ativo só, se `asset` for dado), das mais antigas às mais recentes.
pub fn list_movements(connection: &Connection, asset: Option<i64>) -> AppResult<Vec<Movement>> {
    let mut statement = connection.prepare(&format!(
        "{SELECT_MOVEMENT} WHERE ?1 IS NULL OR asset_id = ?1 ORDER BY date, id"
    ))?;
    let rows = statement
        .query_map([asset], MovementRow::from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    rows.into_iter().map(MovementRow::into_movement).collect()
}

pub fn find_movement(connection: &Connection, id: i64) -> AppResult<Option<Movement>> {
    connection
        .query_row(
            &format!("{SELECT_MOVEMENT} WHERE id = ?1"),
            [id],
            MovementRow::from_row,
        )
        .optional()?
        .map(MovementRow::into_movement)
        .transpose()
}

/// A movimentação vinculada a um lançamento, se houver.
pub fn movement_for_transaction(
    connection: &Connection,
    transaction_id: i64,
) -> AppResult<Option<Movement>> {
    connection
        .query_row(
            &format!("{SELECT_MOVEMENT} WHERE transaction_id = ?1"),
            [transaction_id],
            MovementRow::from_row,
        )
        .optional()?
        .map(MovementRow::into_movement)
        .transpose()
}

/// Dados gravados de uma movimentação.
pub struct MovementFields<'a> {
    pub kind: MovementKind,
    pub date: CalendarDate,
    pub amount: i64,
    pub quantity: Option<i64>,
    pub transaction_id: Option<i64>,
    pub notes: &'a str,
}

/// Retorna o id da nova movimentação.
pub fn insert_movement(
    connection: &Connection,
    asset_id: i64,
    fields: &MovementFields<'_>,
) -> AppResult<i64> {
    if let Some(transaction_id) = fields.transaction_id {
        ensure_unlinked(connection, transaction_id)?;
    }
    connection.execute(
        "INSERT INTO investment_movements
             (asset_id, kind, date, amount, quantity, transaction_id, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            asset_id,
            fields.kind.as_str(),
            fields.date.to_string(),
            fields.amount,
            fields.quantity,
            fields.transaction_id,
            fields.notes,
        ],
    )?;
    Ok(connection.last_insert_rowid())
}

/// Substitui tipo, data, valor, quantidade e observação (o vínculo não muda).
pub fn update_movement(
    connection: &Connection,
    id: i64,
    fields: &MovementFields<'_>,
) -> AppResult<()> {
    let changed = connection.execute(
        "UPDATE investment_movements
         SET kind = ?2, date = ?3, amount = ?4, quantity = ?5, notes = ?6,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        params![
            id,
            fields.kind.as_str(),
            fields.date.to_string(),
            fields.amount,
            fields.quantity,
            fields.notes,
        ],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(MOVEMENT_NOT_FOUND));
    }
    Ok(())
}

/// Acompanha a edição do lançamento vinculado (valor e data vêm dele).
pub fn sync_linked(
    connection: &Connection,
    transaction_id: i64,
    amount: i64,
    date: CalendarDate,
) -> AppResult<()> {
    connection.execute(
        "UPDATE investment_movements
         SET amount = ?2, date = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE transaction_id = ?1",
        params![transaction_id, amount, date.to_string()],
    )?;
    Ok(())
}

/// Exclui a movimentação (o lançamento vinculado continua). Retorna a excluída.
pub fn delete_movement(connection: &Connection, id: i64) -> AppResult<Movement> {
    let movement = find_movement(connection, id)?.ok_or(AppError::NotFound(MOVEMENT_NOT_FOUND))?;
    connection.execute("DELETE FROM investment_movements WHERE id = ?1", [id])?;
    Ok(movement)
}

fn ensure_unlinked(connection: &Connection, transaction_id: i64) -> AppResult<()> {
    let linked: bool = connection.query_row(
        "SELECT EXISTS (SELECT 1 FROM investment_movements WHERE transaction_id = ?1)",
        [transaction_id],
        |row| row.get(0),
    )?;
    if linked {
        return Err(AppError::Validation(
            "este lançamento já está vinculado a um investimento".into(),
        ));
    }
    Ok(())
}

/// Transferências entre uma conta de investimentos e outra conta (de outro
/// tipo) ainda sem movimentação, das mais recentes para as mais antigas.
pub fn unlinked_transfers(
    connection: &Connection,
    limit: usize,
) -> AppResult<Vec<UnlinkedTransfer>> {
    let mut statement = connection.prepare(
        "SELECT t.id, t.account_id, t.transfer_account_id, t.description, t.amount, t.date,
                target.kind = 'investment'
         FROM finance_transactions t
         JOIN finance_accounts source ON source.id = t.account_id
         JOIN finance_accounts target ON target.id = t.transfer_account_id
         WHERE t.kind = 'transfer'
           AND (source.kind = 'investment') != (target.kind = 'investment')
           AND NOT EXISTS (SELECT 1 FROM investment_movements m WHERE m.transaction_id = t.id)
         ORDER BY t.date DESC, t.id DESC
         LIMIT ?1",
    )?;
    let rows = statement
        .query_map([limit as i64], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, bool>(6)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows
        .into_iter()
        .map(
            |(transaction_id, source, target, description, amount, date, into_investment)| {
                let (kind, investment_account_id, other_account_id) = if into_investment {
                    (MovementKind::Contribution, target, source)
                } else {
                    (MovementKind::Withdrawal, source, target)
                };
                UnlinkedTransfer {
                    transaction_id,
                    kind,
                    investment_account_id,
                    other_account_id,
                    description,
                    amount,
                    date,
                }
            },
        )
        .collect())
}

// ---------------------------------------------------------------- Valores informados

/// Valores informados (de um ativo só, se `asset` for dado), dos mais antigos aos mais recentes.
pub fn list_valuations(connection: &Connection, asset: Option<i64>) -> AppResult<Vec<Valuation>> {
    let mut statement = connection.prepare(
        "SELECT asset_id, date, value FROM investment_valuations
         WHERE ?1 IS NULL OR asset_id = ?1
         ORDER BY date",
    )?;
    let rows = statement
        .query_map([asset], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    rows.into_iter()
        .map(|(asset_id, date, value)| {
            Ok(Valuation {
                asset_id,
                date: parse_date(&date)?,
                value,
            })
        })
        .collect()
}

/// Grava o valor do dia (informar de novo no mesmo dia substitui).
pub fn upsert_valuation(connection: &Connection, valuation: &Valuation) -> AppResult<()> {
    if find_asset(connection, valuation.asset_id)?.is_none() {
        return Err(AppError::NotFound(ASSET_NOT_FOUND));
    }
    connection.execute(
        "INSERT INTO investment_valuations (asset_id, date, value) VALUES (?1, ?2, ?3)
         ON CONFLICT (asset_id, date) DO UPDATE
         SET value = excluded.value, created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        params![
            valuation.asset_id,
            valuation.date.to_string(),
            valuation.value
        ],
    )?;
    Ok(())
}

/// Exclui um valor informado. Retorna o excluído.
pub fn delete_valuation(
    connection: &Connection,
    asset_id: i64,
    date: CalendarDate,
) -> AppResult<Valuation> {
    let value: Option<i64> = connection
        .query_row(
            "SELECT value FROM investment_valuations WHERE asset_id = ?1 AND date = ?2",
            params![asset_id, date.to_string()],
            |row| row.get(0),
        )
        .optional()?;
    let value = value.ok_or(AppError::NotFound(VALUATION_NOT_FOUND))?;
    connection.execute(
        "DELETE FROM investment_valuations WHERE asset_id = ?1 AND date = ?2",
        params![asset_id, date.to_string()],
    )?;
    Ok(Valuation {
        asset_id,
        date,
        value,
    })
}

/// Todos os ativos com as movimentações e os valores informados.
pub fn load_portfolio(connection: &Connection) -> AppResult<Vec<AssetHistory>> {
    let mut movements: HashMap<i64, Vec<Movement>> = HashMap::new();
    for movement in list_movements(connection, None)? {
        movements
            .entry(movement.asset_id)
            .or_default()
            .push(movement);
    }
    let mut valuations: HashMap<i64, Vec<Valuation>> = HashMap::new();
    for valuation in list_valuations(connection, None)? {
        valuations
            .entry(valuation.asset_id)
            .or_default()
            .push(valuation);
    }
    Ok(list_assets(connection)?
        .into_iter()
        .map(|asset| {
            let own_movements = movements.remove(&asset.id).unwrap_or_default();
            let own_valuations = valuations.remove(&asset.id).unwrap_or_default();
            (asset, own_movements, own_valuations)
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn date(value: &str) -> CalendarDate {
        CalendarDate::parse(value).unwrap()
    }

    fn valid(name: &str, account_id: i64) -> ValidAsset {
        ValidAsset {
            account_id,
            class: AssetClass::FixedIncome,
            name: name.into(),
            ticker: None,
            maturity_date: Some(date("2028-01-03")),
            notes: String::new(),
        }
    }

    fn fields(kind: MovementKind, on: &str, amount: i64) -> MovementFields<'static> {
        MovementFields {
            kind,
            date: date(on),
            amount,
            quantity: None,
            transaction_id: None,
            notes: "",
        }
    }

    /// Conta corrente (1), de investimentos (2) e uma transferência de 1 para 2.
    fn with_accounts(test: impl FnOnce(&Connection) -> AppResult<()>) {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| {
            connection.execute_batch(
                "INSERT INTO finance_accounts (name, kind, color) VALUES ('C6', 'checking', 'slate');
                 INSERT INTO finance_accounts (name, kind, color) VALUES ('Investimentos', 'investment', 'teal');
                 INSERT INTO finance_transactions
                     (account_id, transfer_account_id, kind, description, amount, date, status)
                 VALUES (1, 2, 'transfer', 'APLICACAO CDB', 100000, '2026-09-10', 'paid');",
            )?;
            test(connection)
        })
        .unwrap();
    }

    #[test]
    fn assets_live_in_investment_accounts() {
        with_accounts(|connection| {
            let id = insert_asset(connection, &valid("CDB C6", 2))?;
            let stored = find_asset(connection, id)?.unwrap();
            assert_eq!(stored.name, "CDB C6");
            assert_eq!(stored.maturity_date, Some(date("2028-01-03")));
            assert!(account_has_assets(connection, 2)? && !account_has_assets(connection, 1)?);

            assert!(matches!(
                insert_asset(connection, &valid("Na conta corrente", 1)),
                Err(AppError::Validation(_))
            ));
            assert!(matches!(
                insert_asset(connection, &valid("Sem conta", 42)),
                Err(AppError::Validation(_))
            ));
            let mut renamed = valid("CDB C6 110%", 2);
            renamed.maturity_date = None;
            update_asset(connection, id, &renamed)?;
            assert_eq!(list_assets(connection)?[0].name, "CDB C6 110%");
            assert!(matches!(
                update_asset(connection, 99, &renamed),
                Err(AppError::NotFound(_))
            ));
            assert_eq!(count_assets(connection)?, 1);
            Ok(())
        });
    }

    #[test]
    fn movements_link_to_transactions_once() {
        with_accounts(|connection| {
            let asset = insert_asset(connection, &valid("CDB C6", 2))?;
            assert_eq!(unlinked_transfers(connection, 10)?.len(), 1);

            let mut linked = fields(MovementKind::Contribution, "2026-09-10", 100_000);
            linked.transaction_id = Some(1);
            let id = insert_movement(connection, asset, &linked)?;
            assert!(matches!(
                insert_movement(connection, asset, &linked),
                Err(AppError::Validation(_))
            ));
            assert!(unlinked_transfers(connection, 10)?.is_empty());
            assert_eq!(movement_for_transaction(connection, 1)?.unwrap().id, id);

            // Editar o lançamento leva o valor e a data junto.
            sync_linked(connection, 1, 120_000, date("2026-09-11"))?;
            let synced = find_movement(connection, id)?.unwrap();
            assert_eq!((synced.amount, synced.date), (120_000, date("2026-09-11")));

            insert_movement(
                connection,
                asset,
                &fields(MovementKind::Income, "2026-09-20", 900),
            )?;
            let kinds: Vec<_> = list_movements(connection, Some(asset))?
                .iter()
                .map(|movement| movement.kind)
                .collect();
            assert_eq!(
                kinds,
                vec![MovementKind::Contribution, MovementKind::Income]
            );

            update_movement(
                connection,
                id,
                &MovementFields {
                    quantity: Some(5),
                    notes: "110% do CDI",
                    ..fields(MovementKind::Contribution, "2026-09-11", 120_000)
                },
            )?;
            let updated = find_movement(connection, id)?.unwrap();
            assert_eq!(
                (
                    updated.quantity,
                    updated.notes.as_str(),
                    updated.transaction_id
                ),
                (Some(5), "110% do CDI", Some(1))
            );

            // Excluir a movimentação devolve a transferência para "sem ativo".
            assert_eq!(delete_movement(connection, id)?.amount, 120_000);
            assert!(matches!(
                delete_movement(connection, id),
                Err(AppError::NotFound(_))
            ));
            assert_eq!(unlinked_transfers(connection, 10)?.len(), 1);
            Ok(())
        });
    }

    #[test]
    fn lists_unlinked_transfers_in_both_directions() {
        with_accounts(|connection| {
            connection.execute_batch(
                "INSERT INTO finance_accounts (name, kind, color) VALUES ('XP', 'investment', 'blue');
                 INSERT INTO finance_transactions
                     (account_id, transfer_account_id, kind, description, amount, date, status)
                 VALUES (2, 1, 'transfer', 'RESGATE CDB', 50000, '2026-09-20', 'paid');
                 -- Entre duas contas de investimentos: não é aplicação nem resgate.
                 INSERT INTO finance_transactions
                     (account_id, transfer_account_id, kind, description, amount, date, status)
                 VALUES (2, 3, 'transfer', 'TED XP', 1000, '2026-09-21', 'paid');",
            )?;
            let unlinked = unlinked_transfers(connection, 10)?;
            assert_eq!(
                unlinked
                    .iter()
                    .map(|t| (
                        t.description.as_str(),
                        t.kind,
                        t.investment_account_id,
                        t.other_account_id
                    ))
                    .collect::<Vec<_>>(),
                vec![
                    ("RESGATE CDB", MovementKind::Withdrawal, 2, 1),
                    ("APLICACAO CDB", MovementKind::Contribution, 2, 1),
                ]
            );
            assert_eq!(unlinked_transfers(connection, 1)?.len(), 1);
            Ok(())
        });
    }

    #[test]
    fn valuations_replace_the_same_day() {
        with_accounts(|connection| {
            let asset = insert_asset(connection, &valid("CDB C6", 2))?;
            let value = |on: &str, value: i64| Valuation {
                asset_id: asset,
                date: date(on),
                value,
            };
            upsert_valuation(connection, &value("2026-09-30", 101_000))?;
            upsert_valuation(connection, &value("2026-09-30", 101_500))?;
            upsert_valuation(connection, &value("2026-08-31", 100_500))?;
            assert_eq!(
                list_valuations(connection, Some(asset))?,
                vec![value("2026-08-31", 100_500), value("2026-09-30", 101_500)]
            );
            assert!(matches!(
                upsert_valuation(
                    connection,
                    &Valuation {
                        asset_id: 99,
                        ..value("2026-09-30", 1)
                    }
                ),
                Err(AppError::NotFound(_))
            ));

            assert_eq!(
                delete_valuation(connection, asset, date("2026-08-31"))?.value,
                100_500
            );
            assert!(matches!(
                delete_valuation(connection, asset, date("2026-08-31")),
                Err(AppError::NotFound(_))
            ));

            insert_movement(
                connection,
                asset,
                &fields(MovementKind::Contribution, "2026-09-10", 100_000),
            )?;
            let portfolio = load_portfolio(connection)?;
            assert_eq!((portfolio[0].1.len(), portfolio[0].2.len()), (1, 1));

            let deleted = delete_asset(connection, asset)?;
            assert_eq!((deleted.movements, deleted.valuations), (1, 1));
            assert!(list_movements(connection, None)?.is_empty());
            assert!(matches!(
                delete_asset(connection, asset),
                Err(AppError::NotFound(_))
            ));
            Ok(())
        });
    }
}
