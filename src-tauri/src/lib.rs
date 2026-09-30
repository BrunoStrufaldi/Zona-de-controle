//! Ponto de entrada da camada nativa do Zona de Controle.
//!
//! Camadas (de fora para dentro):
//! `commands` (IPC) → `services` (casos de uso) → `repositories` (SQL) / `domain`.
//! Leituras do SO (somente leitura) ficam em `platform`.

mod commands;
mod db;
mod domain;
mod error;
mod platform;
mod repositories;
mod services;
mod state;

use tauri::Manager;

use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Notificações locais dos lembretes do calendário (permissões mínimas na capability).
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let state = AppState::initialize(app.handle())?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::get_app_info,
            commands::settings::list_settings,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::audit::list_audit_entries,
            commands::backup::list_database_backups,
            commands::backup::create_database_backup,
            commands::system::get_system_info,
            commands::system::get_system_snapshot,
            commands::system::list_processes,
            commands::diagnostics::run_diagnostics,
            commands::diagnostics::get_diagnostic_thresholds,
            commands::diagnostics::set_diagnostic_thresholds,
            commands::devices::list_battery_providers,
            commands::devices::list_battery_devices,
            commands::devices::list_usb_input_devices,
            commands::devices::set_device_marking,
            commands::optimization::scan_cleanup,
            commands::optimization::list_cleanup_items,
            commands::optimization::run_cleanup,
            commands::optimization::get_cleanup_progress,
            commands::optimization::cancel_cleanup,
            commands::optimization::list_cleanup_history,
            commands::tasks::list_tasks,
            commands::tasks::list_archived_tasks,
            commands::tasks::list_task_tags,
            commands::tasks::create_task,
            commands::tasks::update_task,
            commands::tasks::move_task,
            commands::tasks::set_checklist_item_done,
            commands::tasks::archive_task,
            commands::tasks::archive_completed_tasks,
            commands::tasks::restore_task,
            commands::tasks::delete_task,
            commands::tasks::list_task_categories,
            commands::tasks::create_task_category,
            commands::tasks::update_task_category,
            commands::tasks::delete_task_category,
            commands::notes::list_notes,
            commands::notes::create_note,
            commands::notes::update_note,
            commands::notes::set_note_favorite,
            commands::notes::delete_note,
            commands::notes::list_note_versions,
            commands::notes::restore_note_version,
            commands::notes::list_note_folders,
            commands::notes::create_note_folder,
            commands::notes::rename_note_folder,
            commands::notes::delete_note_folder,
            commands::routines::list_routines,
            commands::routines::create_routine,
            commands::routines::update_routine,
            commands::routines::set_habit_done,
            commands::routines::delete_routine,
            commands::calendar::list_calendar,
            commands::calendar::create_calendar_event,
            commands::calendar::update_calendar_event,
            commands::calendar::update_event_occurrence,
            commands::calendar::delete_calendar_event,
            commands::calendar::delete_event_occurrence,
            commands::calendar::claim_due_reminders,
            commands::finance::list_finance_accounts,
            commands::finance::create_finance_account,
            commands::finance::update_finance_account,
            commands::finance::delete_finance_account,
            commands::finance::list_finance_categories,
            commands::finance::create_finance_category,
            commands::finance::update_finance_category,
            commands::finance::delete_finance_category,
            commands::finance::list_transactions,
            commands::finance::list_transaction_tags,
            commands::finance::create_transaction,
            commands::finance::update_transaction,
            commands::finance::set_transaction_status,
            commands::finance::delete_transaction,
            commands::finance::get_finance_overview,
            commands::finance::preview_finance_import,
            commands::finance::commit_finance_import,
            commands::finance::list_recurring,
            commands::finance::create_recurring,
            commands::finance::update_recurring,
            commands::finance::delete_recurring,
            commands::finance::register_recurring_occurrence,
            commands::finance::link_recurring_occurrence,
            commands::finance::skip_recurring_occurrence,
            commands::finance::reopen_recurring_occurrence,
        ])
        .run(tauri::generate_context!())
        .expect("falha ao iniciar o Zona de Controle");
}
