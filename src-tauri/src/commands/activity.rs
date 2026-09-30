use tauri::State;

use crate::domain::activity::ActivityEntry;
use crate::error::AppResult;
use crate::services::activity as service;
use crate::state::AppState;

/// Atividades recentes de todos os módulos, mais recentes primeiro (somente leitura).
#[tauri::command]
pub async fn list_recent_activity(
    state: State<'_, AppState>,
    limit: u32,
) -> AppResult<Vec<ActivityEntry>> {
    service::list_recent_activity(&state.db, limit)
}
