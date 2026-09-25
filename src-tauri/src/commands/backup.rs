use tauri::State;

use crate::domain::backup::{BackupFile, BackupOverview};
use crate::error::AppResult;
use crate::services::backup as service;
use crate::state::AppState;

/// Pasta de backups e arquivos existentes (somente leitura).
#[tauri::command]
pub async fn list_database_backups(state: State<'_, AppState>) -> AppResult<BackupOverview> {
    service::list_backups(&state.backup_dir)
}

/// Grava uma cópia do banco na pasta de backups (só cria arquivos novos; nunca
/// sobrescreve nem apaga). Auditado em sucesso e falha.
#[tauri::command]
pub async fn create_database_backup(state: State<'_, AppState>) -> AppResult<BackupFile> {
    service::create_backup(&state.db, &state.backup_dir)
}
