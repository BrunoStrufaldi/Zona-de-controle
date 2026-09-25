use tauri::State;

use crate::domain::notes::{Note, NoteFolder, NoteInput, NoteVersion};
use crate::error::AppResult;
use crate::services::notes as service;
use crate::state::AppState;

/// Todas as notas, inclusive as do diário (somente leitura).
#[tauri::command]
pub async fn list_notes(state: State<'_, AppState>) -> AppResult<Vec<Note>> {
    service::list_notes(&state.db)
}

#[tauri::command]
pub async fn create_note(state: State<'_, AppState>, input: NoteInput) -> AppResult<Note> {
    service::create_note(&state.db, input)
}

/// Salva a nota; o texto anterior pode entrar no histórico de versões.
#[tauri::command]
pub async fn update_note(state: State<'_, AppState>, id: i64, input: NoteInput) -> AppResult<Note> {
    service::update_note(&state.db, id, input)
}

#[tauri::command]
pub async fn set_note_favorite(
    state: State<'_, AppState>,
    id: i64,
    favorite: bool,
) -> AppResult<Note> {
    service::set_note_favorite(&state.db, id, favorite)
}

/// Exclusão definitiva (destrutiva, auditada). A interface pede confirmação antes.
#[tauri::command]
pub async fn delete_note(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    service::delete_note(&state.db, id)
}

/// Histórico de versões de uma nota (somente leitura).
#[tauri::command]
pub async fn list_note_versions(
    state: State<'_, AppState>,
    note_id: i64,
) -> AppResult<Vec<NoteVersion>> {
    service::list_versions(&state.db, note_id)
}

/// Volta a nota para uma versão; o texto atual entra no histórico antes.
#[tauri::command]
pub async fn restore_note_version(state: State<'_, AppState>, version_id: i64) -> AppResult<Note> {
    service::restore_version(&state.db, version_id)
}

/// Pastas com a contagem de notas (somente leitura).
#[tauri::command]
pub async fn list_note_folders(state: State<'_, AppState>) -> AppResult<Vec<NoteFolder>> {
    service::list_folders(&state.db)
}

#[tauri::command]
pub async fn create_note_folder(state: State<'_, AppState>, name: String) -> AppResult<NoteFolder> {
    service::create_folder(&state.db, &name)
}

#[tauri::command]
pub async fn rename_note_folder(
    state: State<'_, AppState>,
    id: i64,
    name: String,
) -> AppResult<NoteFolder> {
    service::rename_folder(&state.db, id, &name)
}

/// Exclusão definitiva da pasta (destrutiva, auditada); as notas ficam sem
/// pasta. A interface pede confirmação antes.
#[tauri::command]
pub async fn delete_note_folder(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    service::delete_folder(&state.db, id)
}
