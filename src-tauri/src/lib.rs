//! Ponto de entrada da camada nativa do Zona de Controle.
//!
//! Camadas (de fora para dentro):
//! `commands` (IPC) → `services` (casos de uso) → `repositories` (SQL) / `domain`.

mod commands;
mod db;
mod domain;
mod error;
mod repositories;
mod services;
mod state;

use tauri::Manager;

use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            commands::devices::list_battery_providers,
            commands::devices::list_battery_devices,
            commands::optimization::list_cleanup_categories,
        ])
        .run(tauri::generate_context!())
        .expect("falha ao iniciar o Zona de Controle");
}
