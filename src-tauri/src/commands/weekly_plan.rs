use tauri::State;

use crate::domain::weekly_plan::{PlanBlock, PlanBlockInput};
use crate::error::AppResult;
use crate::services::weekly_plan as service;
use crate::state::AppState;

/// Blocos do planejamento semanal fixo (somente leitura).
#[tauri::command]
pub async fn list_weekly_plan(state: State<'_, AppState>) -> AppResult<Vec<PlanBlock>> {
    service::list_weekly_plan(&state.db)
}

/// Cria um bloco (recusa horário sobreposto a outro bloco no mesmo dia).
#[tauri::command]
pub async fn create_plan_block(
    state: State<'_, AppState>,
    input: PlanBlockInput,
) -> AppResult<PlanBlock> {
    service::create_plan_block(&state.db, input)
}

#[tauri::command]
pub async fn update_plan_block(
    state: State<'_, AppState>,
    id: i64,
    input: PlanBlockInput,
) -> AppResult<PlanBlock> {
    service::update_plan_block(&state.db, id, input)
}

/// Exclusão definitiva (destrutiva, auditada). A interface pede confirmação antes.
#[tauri::command]
pub async fn delete_plan_block(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    service::delete_plan_block(&state.db, id)
}
