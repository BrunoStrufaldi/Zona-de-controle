use tauri::State;

use crate::domain::finance::investments::{
    AssetDetail, AssetInput, AssetView, InvestmentsOverview, Movement, MovementInput,
    ValuationInput,
};
use crate::error::AppResult;
use crate::services::investments as service;
use crate::state::AppState;

/// Carteira com a posição de cada ativo, o patrimônio e as transferências
/// ainda sem ativo (somente leitura).
#[tauri::command]
pub async fn get_investments_overview(
    state: State<'_, AppState>,
) -> AppResult<InvestmentsOverview> {
    service::overview(&state.db)
}

/// Um ativo com todas as movimentações e valores informados (somente leitura).
#[tauri::command]
pub async fn get_investment_asset(state: State<'_, AppState>, id: i64) -> AppResult<AssetDetail> {
    service::asset_detail(&state.db, id)
}

#[tauri::command]
pub async fn create_investment_asset(
    state: State<'_, AppState>,
    input: AssetInput,
) -> AppResult<AssetView> {
    service::create_asset(&state.db, input)
}

#[tauri::command]
pub async fn update_investment_asset(
    state: State<'_, AppState>,
    id: i64,
    input: AssetInput,
) -> AppResult<AssetView> {
    service::update_asset(&state.db, id, input)
}

/// Exclusão definitiva do ativo com o histórico (destrutiva, auditada); os
/// lançamentos vinculados continuam. A interface pede confirmação antes.
#[tauri::command]
pub async fn delete_investment_asset(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    service::delete_asset(&state.db, id)
}

/// Registra aplicação, resgate ou provento (e, com a conta, o lançamento vinculado).
#[tauri::command]
pub async fn create_investment_movement(
    state: State<'_, AppState>,
    asset_id: i64,
    input: MovementInput,
) -> AppResult<Movement> {
    service::create_movement(&state.db, asset_id, input)
}

#[tauri::command]
pub async fn update_investment_movement(
    state: State<'_, AppState>,
    id: i64,
    input: MovementInput,
) -> AppResult<Movement> {
    service::update_movement(&state.db, id, input)
}

/// Exclusão definitiva da movimentação (destrutiva, auditada); o lançamento
/// vinculado continua. A interface pede confirmação antes.
#[tauri::command]
pub async fn delete_investment_movement(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    service::delete_movement(&state.db, id)
}

/// Cria a movimentação a partir de um lançamento existente (ex.: importado).
#[tauri::command]
pub async fn link_investment_transaction(
    state: State<'_, AppState>,
    asset_id: i64,
    transaction_id: i64,
    quantity: Option<i64>,
) -> AppResult<Movement> {
    service::link_transaction(&state.db, asset_id, transaction_id, quantity)
}

/// Grava os valores atuais informados pelo usuário.
#[tauri::command]
pub async fn set_investment_valuations(
    state: State<'_, AppState>,
    valuations: Vec<ValuationInput>,
) -> AppResult<()> {
    service::set_valuations(&state.db, valuations)
}

/// Exclusão definitiva de um valor informado (destrutiva, auditada). A
/// interface pede confirmação antes.
#[tauri::command]
pub async fn delete_investment_valuation(
    state: State<'_, AppState>,
    asset_id: i64,
    date: String,
) -> AppResult<()> {
    service::delete_valuation(&state.db, asset_id, &date)
}
