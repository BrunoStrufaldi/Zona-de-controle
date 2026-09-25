use tauri::State;

use crate::domain::routines::{Routine, RoutineInput};
use crate::error::AppResult;
use crate::services::routines as service;
use crate::state::AppState;

/// Rotinas com hábitos, últimos dias e estatísticas (somente leitura).
#[tauri::command]
pub async fn list_routines(state: State<'_, AppState>) -> AppResult<Vec<Routine>> {
    service::list_routines(&state.db)
}

#[tauri::command]
pub async fn create_routine(state: State<'_, AppState>, input: RoutineInput) -> AppResult<Routine> {
    service::create_routine(&state.db, input)
}

/// Hábitos removidos da lista deixam de valer a partir de hoje (histórico mantido).
#[tauri::command]
pub async fn update_routine(
    state: State<'_, AppState>,
    id: i64,
    input: RoutineInput,
) -> AppResult<Routine> {
    service::update_routine(&state.db, id, input)
}

/// Marca ou desmarca um hábito em um dia (de hoje até 7 dias atrás).
#[tauri::command]
pub async fn set_habit_done(
    state: State<'_, AppState>,
    habit_id: i64,
    date: String,
    done: bool,
) -> AppResult<Routine> {
    service::set_habit_done(&state.db, habit_id, &date, done)
}

/// Exclusão definitiva (destrutiva, auditada). A interface pede confirmação antes.
#[tauri::command]
pub async fn delete_routine(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    service::delete_routine(&state.db, id)
}
