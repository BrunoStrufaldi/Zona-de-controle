use tauri::State;

use crate::domain::diagnostics::{DiagnosticReport, DiagnosticThresholds};
use crate::error::AppResult;
use crate::services::diagnostics::{self as service, DiagnosticSettings};
use crate::state::AppState;

/// Analisa a leitura atual (discos, memória, programas). Somente leitura.
#[tauri::command]
pub async fn run_diagnostics(state: State<'_, AppState>) -> AppResult<DiagnosticReport> {
    service::run_diagnostics(&state.db, &state.system_monitor)
}

/// Limites em uso e os padrões.
#[tauri::command]
pub async fn get_diagnostic_thresholds(
    state: State<'_, AppState>,
) -> AppResult<DiagnosticSettings> {
    service::get_thresholds(&state.db)
}

/// Grava os limites (validados no Rust e auditados).
#[tauri::command]
pub async fn set_diagnostic_thresholds(
    state: State<'_, AppState>,
    thresholds: DiagnosticThresholds,
) -> AppResult<DiagnosticSettings> {
    service::set_thresholds(&state.db, &thresholds)
}
