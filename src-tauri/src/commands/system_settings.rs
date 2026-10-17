use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::State;

use crate::domain::system_settings::hardware::HardwareReport;
use crate::domain::system_settings::WindowsSettingsReport;
use crate::domain::system_tweaks::{filetime_from_unix_ms, TweakRecord, TweakRequest, TweakResult};
use crate::error::{AppError, AppResult};
use crate::platform::cleanup::is_elevated;
use crate::platform::system_settings::WindowsSettingsReader;
use crate::platform::system_tweaks::WindowsTweaker;
use crate::services::system_settings as service;
use crate::services::system_tweaks::{self as tweaks, TweakContext};
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

/// Aplica os ajustes confirmados na tela (plano de energia, Modo de Jogo,
/// inicialização do usuário). Cada um confere o valor atual, guarda o anterior
/// para o Desfazer e é auditado.
#[tauri::command]
pub async fn apply_system_tweaks(
    state: State<'_, AppState>,
    requests: Vec<TweakRequest>,
) -> AppResult<Vec<TweakResult>> {
    let db = Arc::clone(&state.db);
    let context = TweakContext {
        elevated: is_elevated(),
        now_filetime: filetime_from_unix_ms(now_unix_ms()),
    };
    tauri::async_runtime::spawn_blocking(move || {
        tweaks::apply_tweaks(&db, &WindowsTweaker, &requests, &context)
    })
    .await
    .map_err(|_| AppError::StatePoisoned)?
}

/// Volta o valor anterior de um ajuste feito pelo app (auditado).
#[tauri::command]
pub async fn undo_system_tweak(state: State<'_, AppState>, id: i64) -> AppResult<TweakRecord> {
    let db = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        tweaks::undo_tweak(&db, &WindowsTweaker, id, is_elevated())
    })
    .await
    .map_err(|_| AppError::StatePoisoned)?
}

/// Ajustes feitos pelo app, mais recentes primeiro (somente leitura).
#[tauri::command]
pub async fn list_system_tweaks(
    state: State<'_, AppState>,
    limit: u32,
) -> AppResult<Vec<TweakRecord>> {
    tweaks::list_tweaks(&state.db, limit)
}

fn now_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_millis() as i64)
}
