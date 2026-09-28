use tauri::State;

use crate::domain::system_monitor::{ProcessList, SystemInfo, SystemSnapshot};
use crate::error::AppResult;
use crate::state::AppState;

/// Informações fixas da máquina: SO, CPU, núcleos e memória total (somente leitura).
#[tauri::command]
pub async fn get_system_info(state: State<'_, AppState>) -> AppResult<SystemInfo> {
    state.system_monitor.info()
}

/// Uso atual de CPU, memória e discos (somente leitura, nada é gravado).
#[tauri::command]
pub async fn get_system_snapshot(state: State<'_, AppState>) -> AppResult<SystemSnapshot> {
    state.system_monitor.snapshot()
}

/// Processos agrupados por nome, com CPU e memória (somente leitura: não há
/// command para encerrar processos).
#[tauri::command]
pub async fn list_processes(state: State<'_, AppState>) -> AppResult<ProcessList> {
    state.system_monitor.processes()
}
