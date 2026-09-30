//! Casos de uso dos investimentos (Fase 6.1): ativos, movimentações (com o
//! lançamento vinculado), valores informados e a carteira. As exclusões são
//! auditadas (sucesso e falha); os lançamentos vinculados sempre continuam.

use rusqlite::Connection;
use serde_json::json;

use crate::db::Database;
use crate::domain::calendar::CalendarDate;
use crate::domain::finance::investments::{
    build_overview, movement_kind_for, position, AssetDetail, AssetInput, AssetView,
    InvestmentsOverview, Movement, MovementInput, MovementKind, ValidMovement, Valuation,
    ValuationInput, MAX_ASSETS, MAX_QUANTITY, MAX_UNLINKED,
};
use crate::domain::finance::transactions::{TransactionInput, TransactionStatus, ValidTransaction};
use crate::domain::finance::TransactionKind;
use crate::error::{AppError, AppResult};
use crate::repositories::clock::local_today;
use crate::repositories::finance_transactions::TRANSACTION_NOT_FOUND;
use crate::repositories::investments::{MovementFields, ASSET_NOT_FOUND, MOVEMENT_NOT_FOUND};
use crate::repositories::{finance_accounts, finance_transactions, investments};
use crate::services::finance::delete_with_audit;

const ACTION_ASSET_DELETED: &str = "investment_asset.deleted";
const ACTION_MOVEMENT_DELETED: &str = "investment_movement.deleted";
const ACTION_VALUATION_DELETED: &str = "investment_valuation.deleted";

/// Carteira, dinheiro fora dela nas contas de investimentos, patrimônio e as
/// transferências ainda sem ativo.
pub fn overview(db: &Database) -> AppResult<InvestmentsOverview> {
    db.with_connection(|connection| {
        let today = local_today(connection)?;
        Ok(build_overview(
            investments::load_portfolio(connection)?,
            &finance_accounts::list(connection)?,
            investments::unlinked_transfers(connection, MAX_UNLINKED)?,
            today,
        ))
    })
}

/// O ativo com todas as movimentações e valores informados (mais recentes primeiro).
pub fn asset_detail(db: &Database, id: i64) -> AppResult<AssetDetail> {
    db.with_connection(|connection| {
        let asset = load_view(connection, id)?;
        let mut movements = investments::list_movements(connection, Some(id))?;
        movements.reverse();
        let mut valuations = investments::list_valuations(connection, Some(id))?;
        valuations.reverse();
        Ok(AssetDetail {
            asset,
            movements,
            valuations,
        })
    })
}

// ---------------------------------------------------------------- Ativos

pub fn create_asset(db: &Database, input: AssetInput) -> AppResult<AssetView> {
    let asset = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        if investments::count_assets(&transaction)? >= MAX_ASSETS {
            return Err(AppError::Validation(format!(
                "é possível ter no máximo {MAX_ASSETS} ativos"
            )));
        }
        let id = investments::insert_asset(&transaction, &asset)?;
        let created = load_view(&transaction, id)?;
        transaction.commit()?;
        Ok(created)
    })
}

pub fn update_asset(db: &Database, id: i64, input: AssetInput) -> AppResult<AssetView> {
    let asset = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let current = load_asset(&transaction, id)?;
        if current.account_id != asset.account_id
            && investments::list_movements(&transaction, Some(id))?
                .iter()
                .any(|movement| movement.transaction_id.is_some())
        {
            return Err(AppError::Validation(
                "o ativo tem movimentações vinculadas a lançamentos da conta atual; \
                 exclua-as antes de mudar a conta"
                    .into(),
            ));
        }
        investments::update_asset(&transaction, id, &asset)?;
        let updated = load_view(&transaction, id)?;
        transaction.commit()?;
        Ok(updated)
    })
}

/// Exclusão definitiva do ativo com as movimentações e os valores informados
/// (auditada). Os lançamentos vinculados continuam em Lançamentos.
pub fn delete_asset(db: &Database, id: i64) -> AppResult<()> {
    db.with_connection(|connection| {
        delete_with_audit(connection, ACTION_ASSET_DELETED, id, |transaction| {
            let deleted = investments::delete_asset(transaction, id)?;
            Ok(json!({
                "title": deleted.asset.name,
                "class": deleted.asset.class.as_str(),
                "movements": deleted.movements,
                "valuations": deleted.valuations,
            }))
        })
    })
}

// ---------------------------------------------------------------- Movimentações

/// Registra a movimentação. Com `account_id`, cria também o lançamento (a
/// transferência da aplicação/resgate ou a entrada do provento) e o vincula.
/// Resgate total grava o valor zero na data.
pub fn create_movement(db: &Database, asset_id: i64, input: MovementInput) -> AppResult<Movement> {
    let movement = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let asset = load_asset(&transaction, asset_id)?;
        let transaction_id = match movement.account_id {
            Some(account_id) => Some(insert_funding_transaction(
                &transaction,
                &asset.name,
                asset.account_id,
                account_id,
                &movement,
            )?),
            None => None,
        };
        let id = investments::insert_movement(
            &transaction,
            asset_id,
            &MovementFields {
                kind: movement.kind,
                date: movement.date,
                amount: movement.amount,
                quantity: movement.quantity,
                transaction_id,
                notes: &movement.notes,
            },
        )?;
        close_if_asked(&transaction, asset_id, &movement)?;
        let created = load_movement(&transaction, id)?;
        transaction.commit()?;
        Ok(created)
    })
}

/// Edita a movimentação. Vinculada, o tipo não muda e o valor e a data
/// continuam os do lançamento (edite-o em Lançamentos).
pub fn update_movement(db: &Database, id: i64, input: MovementInput) -> AppResult<Movement> {
    let movement = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let current = load_movement(&transaction, id)?;
        let (date, amount) = match current.transaction_id {
            Some(transaction_id) => {
                if movement.kind != current.kind {
                    return Err(AppError::Validation(
                        "o tipo de uma movimentação vinculada a um lançamento não muda".into(),
                    ));
                }
                let linked = finance_transactions::find(&transaction, transaction_id)?
                    .ok_or(AppError::NotFound(TRANSACTION_NOT_FOUND))?;
                let date = CalendarDate::parse(&linked.date).ok_or_else(|| {
                    AppError::Validation(format!("data inválida no banco: {}", linked.date))
                })?;
                (date, linked.amount)
            }
            None => (movement.date, movement.amount),
        };
        investments::update_movement(
            &transaction,
            id,
            &MovementFields {
                kind: movement.kind,
                date,
                amount,
                quantity: movement.quantity,
                transaction_id: current.transaction_id,
                notes: &movement.notes,
            },
        )?;
        close_if_asked(
            &transaction,
            current.asset_id,
            &ValidMovement { date, ..movement },
        )?;
        let updated = load_movement(&transaction, id)?;
        transaction.commit()?;
        Ok(updated)
    })
}

/// Exclusão definitiva da movimentação (auditada). O lançamento vinculado
/// continua e volta a aparecer como transferência sem ativo.
pub fn delete_movement(db: &Database, id: i64) -> AppResult<()> {
    db.with_connection(|connection| {
        delete_with_audit(connection, ACTION_MOVEMENT_DELETED, id, |transaction| {
            let movement = investments::delete_movement(transaction, id)?;
            let asset = load_asset(transaction, movement.asset_id)?;
            Ok(json!({
                "title": asset.name,
                "kind": movement.kind.as_str(),
                "amount": movement.amount,
                "date": movement.date.to_string(),
                "transactionId": movement.transaction_id,
            }))
        })
    })
}

/// Cria a movimentação a partir de um lançamento existente (valor e data vêm
/// dele): transferência para a conta do ativo = aplicação; da conta do ativo =
/// resgate; entrada = provento.
pub fn link_transaction(
    db: &Database,
    asset_id: i64,
    transaction_id: i64,
    quantity: Option<i64>,
) -> AppResult<Movement> {
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let asset = load_asset(&transaction, asset_id)?;
        let linked = finance_transactions::find(&transaction, transaction_id)?
            .ok_or(AppError::NotFound(TRANSACTION_NOT_FOUND))?;
        let account = finance_accounts::find(&transaction, asset.account_id)?.map_or_else(
            || "de investimentos".to_string(),
            |a| format!("“{}”", a.name),
        );
        let kind = movement_kind_for(
            linked.kind,
            linked.account_id,
            linked.transfer_account_id,
            asset.account_id,
        )
        .ok_or_else(|| {
            AppError::Validation(format!(
                "o lançamento precisa ser uma transferência para a conta {account} (aplicação), \
                 dela para outra conta (resgate) ou uma entrada (provento)"
            ))
        })?;
        let quantity = match kind {
            MovementKind::Income => None,
            _ => quantity,
        };
        if quantity.is_some_and(|value| !(1..=MAX_QUANTITY).contains(&value)) {
            return Err(AppError::Validation(
                "a quantidade precisa ser maior que zero e dentro do limite aceito".into(),
            ));
        }
        let date = CalendarDate::parse(&linked.date).ok_or_else(|| {
            AppError::Validation(format!("data inválida no banco: {}", linked.date))
        })?;
        let id = investments::insert_movement(
            &transaction,
            asset_id,
            &MovementFields {
                kind,
                date,
                amount: linked.amount,
                quantity,
                transaction_id: Some(transaction_id),
                notes: "",
            },
        )?;
        let created = load_movement(&transaction, id)?;
        transaction.commit()?;
        Ok(created)
    })
}

/// Chamado ao editar um lançamento: se ele estiver vinculado a uma
/// movimentação, precisa continuar servindo para ela (mesmo tipo e contas),
/// e a movimentação acompanha o valor e a data.
pub(crate) fn follow_transaction_update(
    connection: &Connection,
    transaction_id: i64,
    edited: &ValidTransaction,
) -> AppResult<()> {
    let Some(movement) = investments::movement_for_transaction(connection, transaction_id)? else {
        return Ok(());
    };
    let asset = load_asset(connection, movement.asset_id)?;
    let still = movement_kind_for(
        edited.kind,
        edited.account_id,
        edited.transfer_account_id,
        asset.account_id,
    );
    if still != Some(movement.kind) {
        let what = match movement.kind {
            MovementKind::Contribution => "a aplicação",
            MovementKind::Withdrawal => "o resgate",
            MovementKind::Income => "o provento",
        };
        return Err(AppError::Validation(format!(
            "este lançamento é {what} de “{}” em Investimentos; para mudar o tipo ou as contas, \
             exclua antes a movimentação do ativo",
            asset.name
        )));
    }
    investments::sync_linked(connection, transaction_id, edited.amount, edited.date)
}

// ---------------------------------------------------------------- Valores informados

/// Grava os valores informados (um por ativo e dia; informar de novo substitui).
pub fn set_valuations(db: &Database, inputs: Vec<ValuationInput>) -> AppResult<()> {
    if inputs.is_empty() {
        return Err(AppError::Validation("informe ao menos um valor".into()));
    }
    if inputs.len() > MAX_ASSETS {
        return Err(AppError::Validation(format!(
            "informe no máximo {MAX_ASSETS} valores de uma vez"
        )));
    }
    let valuations = inputs
        .into_iter()
        .map(ValuationInput::validate)
        .collect::<AppResult<Vec<_>>>()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        for valuation in &valuations {
            investments::upsert_valuation(&transaction, valuation)?;
        }
        transaction.commit()?;
        Ok(())
    })
}

/// Exclusão definitiva de um valor informado (auditada).
pub fn delete_valuation(db: &Database, asset_id: i64, date: &str) -> AppResult<()> {
    let date = CalendarDate::parse(date)
        .ok_or_else(|| AppError::Validation(format!("data inválida: {date}")))?;
    db.with_connection(|connection| {
        delete_with_audit(
            connection,
            ACTION_VALUATION_DELETED,
            asset_id,
            |transaction| {
                let asset = load_asset(transaction, asset_id)?;
                let deleted = investments::delete_valuation(transaction, asset_id, date)?;
                Ok(json!({
                    "title": asset.name,
                    "date": deleted.date.to_string(),
                    "value": deleted.value,
                }))
            },
        )
    })
}

// ---------------------------------------------------------------- Apoio

/// Cria o lançamento que move o dinheiro da movimentação e retorna o id.
fn insert_funding_transaction(
    connection: &Connection,
    asset_name: &str,
    asset_account: i64,
    other_account: i64,
    movement: &ValidMovement,
) -> AppResult<i64> {
    if other_account == asset_account {
        return Err(AppError::Validation(
            "escolha a conta de onde o dinheiro sai (ou para onde vai), diferente da conta do ativo"
                .into(),
        ));
    }
    let (kind, account_id, transfer_account_id, label) = match movement.kind {
        MovementKind::Contribution => (
            TransactionKind::Transfer,
            other_account,
            Some(asset_account),
            "Aplicação",
        ),
        MovementKind::Withdrawal => (
            TransactionKind::Transfer,
            asset_account,
            Some(other_account),
            "Resgate",
        ),
        MovementKind::Income => (TransactionKind::Income, other_account, None, "Provento"),
    };
    let valid = TransactionInput {
        account_id,
        transfer_account_id,
        category_id: None,
        kind,
        description: format!("{label} · {asset_name}"),
        amount: movement.amount,
        date: movement.date.to_string(),
        status: TransactionStatus::Paid,
        notes: String::new(),
        tags: Vec::new(),
    }
    .validate()?;
    finance_transactions::insert(connection, &valid)
}

fn close_if_asked(
    connection: &Connection,
    asset_id: i64,
    movement: &ValidMovement,
) -> AppResult<()> {
    if movement.closes_position {
        investments::upsert_valuation(
            connection,
            &Valuation {
                asset_id,
                date: movement.date,
                value: 0,
            },
        )?;
    }
    Ok(())
}

fn load_asset(
    connection: &Connection,
    id: i64,
) -> AppResult<crate::domain::finance::investments::Asset> {
    investments::find_asset(connection, id)?.ok_or(AppError::NotFound(ASSET_NOT_FOUND))
}

fn load_movement(connection: &Connection, id: i64) -> AppResult<Movement> {
    investments::find_movement(connection, id)?.ok_or(AppError::NotFound(MOVEMENT_NOT_FOUND))
}

fn load_view(connection: &Connection, id: i64) -> AppResult<AssetView> {
    let asset = load_asset(connection, id)?;
    let today = local_today(connection)?;
    let movements = investments::list_movements(connection, Some(id))?;
    let valuations = investments::list_valuations(connection, Some(id))?;
    Ok(AssetView::new(
        asset,
        position(&movements, &valuations, today),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::finance::accounts::{AccountInput, AccountKind};
    use crate::domain::finance::investments::{AssetClass, ValueStatus};
    use crate::domain::task_categories::CategoryColor;
    use crate::repositories::audit;
    use crate::services::finance;

    fn account(db: &Database, name: &str, kind: AccountKind) -> i64 {
        finance::create_account(
            db,
            AccountInput {
                name: name.into(),
                kind,
                color: CategoryColor::Teal,
                opening_balance: 0,
                closing_day: None,
                due_day: None,
            },
        )
        .unwrap()
        .id
    }

    fn cdb(account_id: i64) -> AssetInput {
        AssetInput {
            account_id,
            class: AssetClass::FixedIncome,
            name: "CDB C6".into(),
            ticker: None,
            maturity_date: Some("2028-01-03".into()),
            notes: String::new(),
        }
    }

    fn movement(
        kind: MovementKind,
        date: &str,
        amount: i64,
        account: Option<i64>,
    ) -> MovementInput {
        MovementInput {
            kind,
            date: date.into(),
            amount,
            quantity: None,
            notes: String::new(),
            account_id: account,
            closes_position: false,
        }
    }

    fn transfer(from: i64, to: i64, amount: i64, date: &str) -> TransactionInput {
        TransactionInput {
            account_id: from,
            transfer_account_id: Some(to),
            category_id: None,
            kind: TransactionKind::Transfer,
            description: "APLICACAO CDB".into(),
            amount,
            date: date.into(),
            status: TransactionStatus::Paid,
            notes: String::new(),
            tags: Vec::new(),
        }
    }

    fn audit_log(db: &Database) -> Vec<audit::AuditEntry> {
        db.with_connection(|connection| audit::list_recent(connection, 10))
            .unwrap()
    }

    #[test]
    fn contributions_create_the_transfer_and_keep_net_worth() {
        let db = Database::open_in_memory().unwrap();
        let checking = account(&db, "C6", AccountKind::Checking);
        let investments = account(&db, "Investimentos C6", AccountKind::Investment);
        let asset = create_asset(&db, cdb(investments)).unwrap();
        assert_eq!(asset.maturity_date.as_deref(), Some("2028-01-03"));

        let applied = create_movement(
            &db,
            asset.id,
            movement(
                MovementKind::Contribution,
                "2026-09-10",
                100_000,
                Some(checking),
            ),
        )
        .unwrap();
        let transfer = finance::list_transactions(&db, "2026-09-01", "2026-09-30").unwrap();
        assert_eq!(transfer.len(), 1);
        assert_eq!(transfer[0].description, "Aplicação · CDB C6");
        assert_eq!(transfer[0].investment_asset_id, Some(asset.id));
        assert_eq!(applied.transaction_id, Some(transfer[0].id));

        set_valuations(
            &db,
            vec![ValuationInput {
                asset_id: asset.id,
                date: "2026-09-30".into(),
                value: 100_900,
            }],
        )
        .unwrap();
        let overview = overview(&db).unwrap();
        assert_eq!(overview.totals.value, 100_900);
        assert_eq!(overview.totals.gain, 900);
        // O dinheiro saiu da conta corrente e entrou na carteira: conta uma vez só.
        assert_eq!(overview.accounts[0].cash, 0);
        assert_eq!(overview.net_worth.accounts, -100_000);
        assert_eq!(overview.net_worth.total, 900);
        assert!(overview.unlinked.is_empty());

        // Provento na conta corrente: entrada vinculada.
        create_movement(
            &db,
            asset.id,
            movement(MovementKind::Income, "2026-09-30", 500, Some(checking)),
        )
        .unwrap();
        let detail = asset_detail(&db, asset.id).unwrap();
        assert_eq!(detail.movements[0].kind, MovementKind::Income);
        assert_eq!(detail.asset.position.income, 500);
        assert_eq!(detail.valuations.len(), 1);

        // A conta do próprio ativo não serve de origem.
        assert!(matches!(
            create_movement(
                &db,
                asset.id,
                movement(
                    MovementKind::Contribution,
                    "2026-09-10",
                    1,
                    Some(investments)
                ),
            ),
            Err(AppError::Validation(_))
        ));
        // Conta com ativos não vira outro tipo nem pode ser excluída.
        assert!(finance::update_account(
            &db,
            investments,
            AccountInput {
                name: "Investimentos C6".into(),
                kind: AccountKind::Checking,
                color: CategoryColor::Teal,
                opening_balance: 0,
                closing_day: None,
                due_day: None,
            },
        )
        .is_err());
        assert!(finance::delete_account(&db, investments).is_err());
    }

    #[test]
    fn imported_transfers_are_linked_and_followed() {
        let db = Database::open_in_memory().unwrap();
        let checking = account(&db, "C6", AccountKind::Checking);
        let investments = account(&db, "Investimentos", AccountKind::Investment);
        let asset = create_asset(&db, cdb(investments)).unwrap();
        let applied =
            finance::create_transaction(&db, transfer(checking, investments, 50_000, "2026-09-10"))
                .unwrap();
        let expense = finance::create_transaction(
            &db,
            TransactionInput {
                kind: TransactionKind::Expense,
                transfer_account_id: None,
                ..transfer(checking, investments, 100, "2026-09-10")
            },
        )
        .unwrap();

        let before = overview(&db).unwrap();
        assert_eq!(before.unlinked.len(), 1);
        assert_eq!(before.unlinked[0].kind, MovementKind::Contribution);
        // Sem ativo, o dinheiro fica parado na conta de investimentos.
        assert_eq!(before.accounts[0].cash, 50_000);

        assert!(matches!(
            link_transaction(&db, asset.id, expense.id, None),
            Err(AppError::Validation(_))
        ));
        let linked = link_transaction(&db, asset.id, applied.id, Some(1_000)).unwrap();
        assert_eq!(
            (linked.kind, linked.amount, linked.quantity),
            (MovementKind::Contribution, 50_000, Some(1_000))
        );
        assert!(link_transaction(&db, asset.id, applied.id, None).is_err());
        let after = overview(&db).unwrap();
        assert!(after.unlinked.is_empty());
        assert_eq!(after.accounts[0].cash, 0);
        assert_eq!(
            after.assets[0].position.value_status,
            ValueStatus::NotInformed
        );

        // Editar o valor do lançamento leva a movimentação junto…
        finance::update_transaction(
            &db,
            applied.id,
            transfer(checking, investments, 55_000, "2026-09-11"),
        )
        .unwrap();
        let followed = asset_detail(&db, asset.id).unwrap().movements[0].clone();
        assert_eq!(
            (followed.amount, followed.date.to_string().as_str()),
            (55_000, "2026-09-11")
        );
        // …mas ele não pode deixar de ser uma aplicação do ativo.
        assert!(matches!(
            finance::update_transaction(
                &db,
                applied.id,
                transfer(investments, checking, 55_000, "2026-09-11")
            ),
            Err(AppError::Validation(_))
        ));
        // Na movimentação vinculada, o valor e a data seguem o lançamento.
        let edited = update_movement(
            &db,
            linked.id,
            MovementInput {
                quantity: Some(2_000),
                ..movement(MovementKind::Contribution, "2026-01-01", 1, None)
            },
        )
        .unwrap();
        assert_eq!((edited.amount, edited.quantity), (55_000, Some(2_000)));
        assert!(update_movement(
            &db,
            linked.id,
            movement(MovementKind::Withdrawal, "2026-09-11", 1, None)
        )
        .is_err());

        // Excluir o lançamento desfaz o vínculo; a aplicação continua.
        finance::delete_transaction(&db, applied.id).unwrap();
        let kept = asset_detail(&db, asset.id).unwrap().movements;
        assert_eq!((kept.len(), kept[0].transaction_id), (1, None));
    }

    #[test]
    fn full_withdrawal_zeroes_the_value() {
        let db = Database::open_in_memory().unwrap();
        let checking = account(&db, "C6", AccountKind::Checking);
        let investments = account(&db, "Investimentos", AccountKind::Investment);
        let asset = create_asset(&db, cdb(investments)).unwrap();
        create_movement(
            &db,
            asset.id,
            movement(MovementKind::Contribution, "2026-01-10", 100_000, None),
        )
        .unwrap();
        create_movement(
            &db,
            asset.id,
            MovementInput {
                closes_position: true,
                ..movement(
                    MovementKind::Withdrawal,
                    "2026-09-15",
                    95_000,
                    Some(checking),
                )
            },
        )
        .unwrap();
        let detail = asset_detail(&db, asset.id).unwrap();
        assert!(detail.asset.position.closed);
        assert_eq!(detail.asset.position.gain, -5_000);
        assert_eq!(detail.valuations[0].value, 0);
        let resgate = finance::list_transactions(&db, "2026-09-01", "2026-09-30").unwrap();
        assert_eq!(
            (resgate[0].account_id, resgate[0].transfer_account_id),
            (investments, Some(checking))
        );
    }

    #[test]
    fn deletions_are_audited_and_keep_transactions() {
        let db = Database::open_in_memory().unwrap();
        let checking = account(&db, "C6", AccountKind::Checking);
        let investments = account(&db, "Investimentos", AccountKind::Investment);
        let asset = create_asset(&db, cdb(investments)).unwrap();
        let applied = create_movement(
            &db,
            asset.id,
            movement(
                MovementKind::Contribution,
                "2026-09-10",
                100_000,
                Some(checking),
            ),
        )
        .unwrap();
        set_valuations(
            &db,
            vec![ValuationInput {
                asset_id: asset.id,
                date: "2026-09-30".into(),
                value: 100_900,
            }],
        )
        .unwrap();

        delete_valuation(&db, asset.id, "2026-09-30").unwrap();
        delete_movement(&db, applied.id).unwrap();
        // A transferência continua e volta a ficar sem ativo.
        assert_eq!(overview(&db).unwrap().unlinked.len(), 1);
        delete_asset(&db, asset.id).unwrap();
        assert!(delete_asset(&db, asset.id).is_err());

        let log = audit_log(&db);
        assert_eq!(
            log.iter()
                .map(|entry| (entry.action.as_str(), entry.outcome.as_str()))
                .collect::<Vec<_>>(),
            vec![
                (ACTION_ASSET_DELETED, "failure"),
                (ACTION_ASSET_DELETED, "success"),
                (ACTION_MOVEMENT_DELETED, "success"),
                (ACTION_VALUATION_DELETED, "success"),
            ]
        );
        assert_eq!(
            log[1].details,
            Some(
                json!({ "title": "CDB C6", "class": "fixed_income", "movements": 0, "valuations": 0 })
            )
        );
        assert_eq!(
            log[2].details,
            Some(json!({
                "title": "CDB C6",
                "kind": "contribution",
                "amount": 100_000,
                "date": "2026-09-10",
                "transactionId": applied.transaction_id,
            }))
        );
        assert_eq!(
            log[3].details,
            Some(json!({ "title": "CDB C6", "date": "2026-09-30", "value": 100_900 }))
        );
        assert_eq!(
            finance::list_transactions(&db, "2026-09-01", "2026-09-30")
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn assets_need_an_investment_account() {
        let db = Database::open_in_memory().unwrap();
        let checking = account(&db, "C6", AccountKind::Checking);
        assert!(matches!(
            create_asset(&db, cdb(checking)),
            Err(AppError::Validation(_))
        ));
        assert!(set_valuations(&db, Vec::new()).is_err());
    }
}
