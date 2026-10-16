use std::sync::Arc;

use tauri::State;

use crate::domain::system_settings::hardware::HardwareReport;
use crate::domain::system_settings::WindowsSettingsReport;
use crate::error::{AppError, AppResult};
use crate::platform::system_settings::WindowsSettingsReader;
use crate::services::system_settings as service;
use crate::state::AppState;

/// Energia, Modo de Jogo, HAGS, reinício pendente e programas na inicialização.
/// Somente leitura.
#[tauri::command]
pub async fn analyze_windows_settings() -> AppResult<WindowsSettingsReport> {
    // Confere se cada programa da inicialização existe: fora das threads do runtime.
    tauri::async_runtime::spawn_blocking(|| service::windows_settings(&WindowsSettingsReader))
        .await
        .map_err(|_| AppError::StatePoisoned)
}

/// BIOS, placa-mãe, Secure Boot, TPM, virtualização, CPU e memória. Somente leitura.
#[tauri::command]
pub async fn analyze_hardware(state: State<'_, AppState>) -> AppResult<HardwareReport> {
    let db = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || service::hardware(&db, &WindowsSettingsReader))
        .await
        .map_err(|_| AppError::StatePoisoned)?
}
