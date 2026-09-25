use tauri::State;

use crate::domain::task_categories::{TaskCategory, TaskCategoryInput};
use crate::domain::tasks::{Task, TaskChange, TaskInput, TaskStatus};
use crate::error::AppResult;
use crate::services::task_categories as categories;
use crate::services::tasks as service;
use crate::state::AppState;

/// Tarefas ativas, sem as arquivadas (somente leitura).
#[tauri::command]
pub async fn list_tasks(state: State<'_, AppState>) -> AppResult<Vec<Task>> {
    service::list_tasks(&state.db)
}

/// Tarefas arquivadas (somente leitura).
#[tauri::command]
pub async fn list_archived_tasks(state: State<'_, AppState>) -> AppResult<Vec<Task>> {
    service::list_archived_tasks(&state.db)
}

/// Tags em uso pelas tarefas (somente leitura).
#[tauri::command]
pub async fn list_task_tags(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    service::list_tags(&state.db)
}

#[tauri::command]
pub async fn create_task(state: State<'_, AppState>, input: TaskInput) -> AppResult<TaskChange> {
    service::create_task(&state.db, input)
}

#[tauri::command]
pub async fn update_task(
    state: State<'_, AppState>,
    id: i64,
    input: TaskInput,
) -> AppResult<TaskChange> {
    service::update_task(&state.db, id, input)
}

/// Move a tarefa para outra coluna/posição do Kanban. Concluir uma tarefa
/// recorrente cria a próxima ocorrência (retornada em `nextOccurrence`).
#[tauri::command]
pub async fn move_task(
    state: State<'_, AppState>,
    id: i64,
    status: TaskStatus,
    before_id: Option<i64>,
) -> AppResult<TaskChange> {
    service::move_task(&state.db, id, status, before_id)
}

/// Marca ou desmarca um item da checklist de uma tarefa.
#[tauri::command]
pub async fn set_checklist_item_done(
    state: State<'_, AppState>,
    item_id: i64,
    done: bool,
) -> AppResult<Task> {
    service::set_checklist_item_done(&state.db, item_id, done)
}

/// Arquiva a tarefa (reversível: não apaga dados).
#[tauri::command]
pub async fn archive_task(state: State<'_, AppState>, id: i64) -> AppResult<Task> {
    service::archive_task(&state.db, id)
}

/// Arquiva todas as tarefas concluídas. Retorna quantas foram arquivadas.
#[tauri::command]
pub async fn archive_completed_tasks(state: State<'_, AppState>) -> AppResult<usize> {
    service::archive_completed_tasks(&state.db)
}

#[tauri::command]
pub async fn restore_task(state: State<'_, AppState>, id: i64) -> AppResult<Task> {
    service::restore_task(&state.db, id)
}

/// Exclusão definitiva (destrutiva, auditada). A interface pede confirmação antes.
#[tauri::command]
pub async fn delete_task(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    service::delete_task(&state.db, id)
}

/// Categorias com a contagem de tarefas (somente leitura).
#[tauri::command]
pub async fn list_task_categories(state: State<'_, AppState>) -> AppResult<Vec<TaskCategory>> {
    categories::list_categories(&state.db)
}

#[tauri::command]
pub async fn create_task_category(
    state: State<'_, AppState>,
    input: TaskCategoryInput,
) -> AppResult<TaskCategory> {
    categories::create_category(&state.db, input)
}

#[tauri::command]
pub async fn update_task_category(
    state: State<'_, AppState>,
    id: i64,
    input: TaskCategoryInput,
) -> AppResult<TaskCategory> {
    categories::update_category(&state.db, id, input)
}

/// Exclusão definitiva da categoria (destrutiva, auditada); as tarefas ficam
/// sem categoria. A interface pede confirmação antes.
#[tauri::command]
pub async fn delete_task_category(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    categories::delete_category(&state.db, id)
}
