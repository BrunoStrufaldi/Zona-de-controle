use std::sync::Arc;

use tauri::State;

use crate::domain::disk_usage::{FolderChildren, FolderId};
use crate::error::{AppError, AppResult};
use crate::platform::disk_usage::VolumeLister;
use crate::services::disk_usage::{self as service, DiskUsageProgress, DiskUsageScan, Volume};
use crate::state::AppState;

/// Analisa o que ocupa a unidade `mount_point` (somente leitura: só lê nomes,
/// tamanhos e datas). A unidade precisa estar na lista do monitor: a tela
/// nunca manda um caminho. `null` se a análise foi cancelada.
#[tauri::command]
pub async fn scan_disk_usage(
    state: State<'_, AppState>,
    mount_point: String,
) -> AppResult<Option<DiskUsageScan>> {
    let volume: Volume = state
        .system_monitor
        .snapshot()?
        .disks
        .into_iter()
        .find(|disk| disk.mount_point.eq_ignore_ascii_case(&mount_point))
        .ok_or_else(|| {
            AppError::Validation(
                "Unidade não encontrada. Confira se ela ainda está conectada.".into(),
            )
        })?
        .into();
    let run = Arc::clone(&state.disk_usage_run);
    let store = Arc::clone(&state.disk_usage_scans);
    // Percorrer a unidade leva de segundos a minutos: fora das threads do runtime.
    tauri::async_runtime::spawn_blocking(move || {
        service::run_scan(&VolumeLister, &volume, &run, &store)
    })
    .await
    .map_err(|_| AppError::StatePoisoned)?
}

/// Andamento da análise em curso (`null` se nenhuma estiver rodando).
#[tauri::command]
pub async fn get_disk_usage_progress(
    state: State<'_, AppState>,
) -> AppResult<Option<DiskUsageProgress>> {
    state.disk_usage_run.progress()
}

/// Pede para a análise parar (a anterior continua valendo).
#[tauri::command]
pub async fn cancel_disk_usage(state: State<'_, AppState>) -> AppResult<bool> {
    state.disk_usage_run.request_cancel()
}

/// A última análise concluída (`null` se nenhuma foi feita desde que o app abriu).
#[tauri::command]
pub async fn get_disk_usage_scan(state: State<'_, AppState>) -> AppResult<Option<DiskUsageScan>> {
    service::latest_scan(&state.disk_usage_scans)
}

/// Conteúdo de uma pasta da análise `scan_id`, maiores primeiro (somente leitura).
#[tauri::command]
pub async fn list_disk_usage_children(
    state: State<'_, AppState>,
    scan_id: u64,
    folder_id: FolderId,
    limit: usize,
) -> AppResult<FolderChildren> {
    service::list_children(&state.disk_usage_scans, scan_id, folder_id, limit)
}
