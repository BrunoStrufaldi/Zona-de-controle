use tauri::State;

use crate::error::AppResult;
use crate::repositories::audit::{self, AuditEntry};
use crate::state::AppState;

const DEFAULT_LIMIT: u32 = 50;
const MAX_LIMIT: u32 = 200;

/// Registros de auditoria mais recentes (somente leitura).
#[tauri::command]
pub async fn list_audit_entries(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> AppResult<Vec<AuditEntry>> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    state
        .db
        .with_connection(|connection| audit::list_recent(connection, limit))
}
