use std::sync::Arc;

use tauri::State;

use crate::domain::optimization::{CleanupItemPage, CleanupScan, CleanupSource};
use crate::error::{AppError, AppResult};
use crate::platform::cleanup::FileSystemAnalyzer;
use crate::services::optimization as service;
use crate::state::AppState;

/// Analisa temporários, caches seguros e Lixeira (somente leitura: nada é
/// removido). Substitui a análise anterior.
#[tauri::command]
pub async fn scan_cleanup(state: State<'_, AppState>) -> AppResult<CleanupScan> {
    let drives = state
        .system_monitor
        .snapshot()?
        .disks
        .into_iter()
        .filter(|disk| !disk.removable)
        .map(|disk| disk.mount_point)
        .collect();
    let running = service::running_process_names(&state.system_monitor.processes()?);
    let analyzer = FileSystemAnalyzer::new(state.local_app_data.clone(), drives);
    let store = Arc::clone(&state.cleanup_scans);
    // Percorrer as pastas pode levar alguns segundos: fora das threads do runtime.
    tauri::async_runtime::spawn_blocking(move || service::run_scan(&analyzer, &running, &store))
        .await
        .map_err(|_| AppError::StatePoisoned)?
}

/// Uma página dos itens de uma origem da última análise (somente leitura).
#[tauri::command]
pub async fn list_cleanup_items(
    state: State<'_, AppState>,
    scan_id: u64,
    source: CleanupSource,
    offset: usize,
    limit: usize,
) -> AppResult<CleanupItemPage> {
    service::list_items(&state.cleanup_scans, scan_id, source, offset, limit)
}
