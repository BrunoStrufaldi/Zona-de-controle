use std::sync::Arc;

use tauri::State;

use crate::domain::optimization::{
    CleanupHistory, CleanupItemPage, CleanupProgress, CleanupReport, CleanupScan, CleanupSource,
};
use crate::domain::system_monitor::DiskUsage;
use crate::error::{AppError, AppResult};
use crate::platform::cleanup::{is_elevated, FileSystemAnalyzer};
use crate::platform::cleanup_executor::FileSystemExecutor;
use crate::services::optimization::{self as service, CleanupContext};
use crate::state::AppState;

/// Unidades fixas (onde procurar a Lixeira).
fn fixed_drives(state: &AppState) -> AppResult<Vec<String>> {
    Ok(state
        .system_monitor
        .snapshot()?
        .disks
        .into_iter()
        .filter(|disk| !disk.removable)
        .map(|disk: DiskUsage| disk.mount_point)
        .collect())
}

/// Analisa temporários, caches seguros e Lixeira (somente leitura: nada é
/// removido). Substitui a análise anterior.
#[tauri::command]
pub async fn scan_cleanup(state: State<'_, AppState>) -> AppResult<CleanupScan> {
    let drives = fixed_drives(&state)?;
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

/// Remove os itens das origens escolhidas da análise `scan_id` — DESTRUTIVO.
/// Só é chamado depois da confirmação explícita na tela; cada item é conferido
/// de novo e o resultado (ou a falha) é auditado.
#[tauri::command]
pub async fn run_cleanup(
    state: State<'_, AppState>,
    scan_id: u64,
    sources: Vec<CleanupSource>,
) -> AppResult<CleanupReport> {
    let context = CleanupContext {
        running: service::running_process_names(&state.system_monitor.processes()?),
        elevated: is_elevated(),
    };
    let mut executor = FileSystemExecutor::new(fixed_drives(&state)?);
    let db = Arc::clone(&state.db);
    let store = Arc::clone(&state.cleanup_scans);
    let run = Arc::clone(&state.cleanup_run);
    tauri::async_runtime::spawn_blocking(move || {
        service::run_cleanup(
            &db,
            &store,
            &run,
            &mut executor,
            scan_id,
            &sources,
            &context,
        )
    })
    .await
    .map_err(|_| AppError::StatePoisoned)?
}

/// Andamento da limpeza em curso (`null` se nenhuma estiver rodando).
#[tauri::command]
pub async fn get_cleanup_progress(
    state: State<'_, AppState>,
) -> AppResult<Option<CleanupProgress>> {
    state.cleanup_run.progress()
}

/// Pede para a limpeza parar antes do próximo arquivo.
#[tauri::command]
pub async fn cancel_cleanup(state: State<'_, AppState>) -> AppResult<bool> {
    state.cleanup_run.request_cancel()
}

/// Limpezas mais recentes e os totais do histórico (lidos do log de auditoria).
#[tauri::command]
pub async fn list_cleanup_history(
    state: State<'_, AppState>,
    limit: u32,
) -> AppResult<CleanupHistory> {
    service::cleanup_history(&state.db, limit)
}
