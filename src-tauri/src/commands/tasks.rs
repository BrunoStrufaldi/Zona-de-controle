use tauri::State;

use crate::domain::tasks::{Task, TaskInput, TaskStatus};
use crate::error::AppResult;
use crate::services::tasks as service;
use crate::state::AppState;

/// Todas as tarefas (somente leitura).
#[tauri::command]
pub async fn list_tasks(state: State<'_, AppState>) -> AppResult<Vec<Task>> {
    service::list_tasks(&state.db)
}

/// Tags em uso pelas tarefas (somente leitura).
#[tauri::command]
pub async fn list_task_tags(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    service::list_tags(&state.db)
}

#[tauri::command]
pub async fn create_task(state: State<'_, AppState>, input: TaskInput) -> AppResult<Task> {
    service::create_task(&state.db, input)
}

#[tauri::command]
pub async fn update_task(state: State<'_, AppState>, id: i64, input: TaskInput) -> AppResult<Task> {
    service::update_task(&state.db, id, input)
}

/// Move a tarefa para outra coluna/posição do Kanban.
#[tauri::command]
pub async fn move_task(
    state: State<'_, AppState>,
    id: i64,
    status: TaskStatus,
    before_id: Option<i64>,
) -> AppResult<Task> {
    service::move_task(&state.db, id, status, before_id)
}

/// Exclusão definitiva (destrutiva, auditada). A interface pede confirmação antes.
#[tauri::command]
pub async fn delete_task(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    service::delete_task(&state.db, id)
}
