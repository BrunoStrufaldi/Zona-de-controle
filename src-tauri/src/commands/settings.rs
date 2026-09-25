use tauri::State;

use crate::error::AppResult;
use crate::repositories::settings::SettingEntry;
use crate::services::settings as service;
use crate::state::AppState;

#[tauri::command]
pub async fn list_settings(state: State<'_, AppState>) -> AppResult<Vec<SettingEntry>> {
    service::list_settings(&state.db)
}

#[tauri::command]
pub async fn get_setting(
    state: State<'_, AppState>,
    key: String,
) -> AppResult<Option<SettingEntry>> {
    service::get_setting(&state.db, &key)
}

/// Grava uma configuração (auditado).
#[tauri::command]
pub async fn set_setting(
    state: State<'_, AppState>,
    key: String,
    value: serde_json::Value,
) -> AppResult<SettingEntry> {
    service::update_setting(&state.db, &key, &value)
}
