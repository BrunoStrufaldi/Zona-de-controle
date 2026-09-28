use tauri::State;

use crate::domain::calendar_events::{
    CalendarAgenda, CalendarEvent, DueReminder, EventInput, OccurrenceInput,
};
use crate::error::AppResult;
use crate::services::calendar as service;
use crate::state::AppState;

/// Ocorrências de eventos e tarefas com vencimento entre `from` e `to` (somente leitura).
#[tauri::command]
pub async fn list_calendar(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> AppResult<CalendarAgenda> {
    service::list_calendar(&state.db, &from, &to)
}

#[tauri::command]
pub async fn create_calendar_event(
    state: State<'_, AppState>,
    input: EventInput,
) -> AppResult<CalendarEvent> {
    service::create_event(&state.db, input)
}

/// Edita toda a série. Mudar o início ou a repetição descarta as alterações
/// feitas em ocorrências individuais (auditado).
#[tauri::command]
pub async fn update_calendar_event(
    state: State<'_, AppState>,
    id: i64,
    input: EventInput,
) -> AppResult<CalendarEvent> {
    service::update_event(&state.db, id, input)
}

/// Edita só uma ocorrência de um evento recorrente.
#[tauri::command]
pub async fn update_event_occurrence(
    state: State<'_, AppState>,
    event_id: i64,
    occurrence_date: String,
    input: OccurrenceInput,
) -> AppResult<()> {
    service::update_occurrence(&state.db, event_id, &occurrence_date, input)
}

/// Exclusão definitiva da série (destrutiva, auditada). A interface pede confirmação antes.
#[tauri::command]
pub async fn delete_calendar_event(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    service::delete_event(&state.db, id)
}

/// Exclui só uma ocorrência (destrutiva, auditada). A interface pede confirmação antes.
#[tauri::command]
pub async fn delete_event_occurrence(
    state: State<'_, AppState>,
    event_id: i64,
    occurrence_date: String,
) -> AppResult<()> {
    service::delete_occurrence(&state.db, event_id, &occurrence_date)
}

/// Lembretes vencidos ainda não avisados; cada um é devolvido uma única vez.
#[tauri::command]
pub async fn claim_due_reminders(state: State<'_, AppState>) -> AppResult<Vec<DueReminder>> {
    service::claim_due_reminders(&state.db)
}
