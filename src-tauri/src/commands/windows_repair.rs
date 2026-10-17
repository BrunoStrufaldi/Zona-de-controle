use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::State;

use crate::domain::windows_repair::{
    RepairHistoryEntry, RepairProgress, RepairReadiness, RepairReport,
};
use crate::error::{AppError, AppResult};
use crate::platform::system_settings::read_pending_reboot;
use crate::platform::windows_repair::{tools_available, WindowsRepairLauncher};
use crate::services::windows_repair as service;
use crate::state::AppState;

/// Antes de oferecer o reparo: ferramentas presentes e reinício pendente.
/// Somente leitura.
#[tauri::command]
pub async fn check_windows_repair(state: State<'_, AppState>) -> AppResult<RepairReadiness> {
    Ok(RepairReadiness {
        tools_available: tools_available(),
        pending_reboot: read_pending_reboot().map(|pending| pending.required()),
        running: state.windows_repair_run.is_running(),
    })
}

/// Reparo do Windows (exige administrador): pede a elevação pelo UAC e roda a
/// sequência fixa DISM + SFC. Bloqueia até o fim; o andamento sai por
/// `get_windows_repair_progress`. Início e fim são auditados.
#[tauri::command]
pub async fn run_windows_repair(state: State<'_, AppState>) -> AppResult<RepairReport> {
    let db = Arc::clone(&state.db);
    let run = Arc::clone(&state.windows_repair_run);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let run_id = format!("{:x}", now.as_nanos());
    let started_at_ms = now.as_millis() as i64;
    tauri::async_runtime::spawn_blocking(move || {
        service::run_repair(&db, &run, &WindowsRepairLauncher, &run_id, started_at_ms)
    })
    .await
    .map_err(|_| AppError::StatePoisoned)?
}

/// Andamento do reparo (`null` se nenhum estiver rodando).
#[tauri::command]
pub async fn get_windows_repair_progress(
    state: State<'_, AppState>,
) -> AppResult<Option<RepairProgress>> {
    state.windows_repair_run.progress()
}

/// Pede o cancelamento: a DISM para; o SFC já iniciado vai até o fim.
#[tauri::command]
pub async fn cancel_windows_repair(state: State<'_, AppState>) -> AppResult<bool> {
    state.windows_repair_run.request_cancel()
}

/// Reparos mais recentes primeiro (lidos do log de auditoria).
#[tauri::command]
pub async fn list_windows_repair_history(
    state: State<'_, AppState>,
    limit: u32,
) -> AppResult<Vec<RepairHistoryEntry>> {
    service::repair_history(&state.db, limit)
}
