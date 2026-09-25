use serde::Serialize;
use tauri::{AppHandle, State};

use crate::error::AppResult;
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub identifier: String,
    pub database_path: String,
    pub schema_version: u32,
}

/// Informações do app e do banco local (somente leitura).
#[tauri::command]
pub async fn get_app_info(app: AppHandle, state: State<'_, AppState>) -> AppResult<AppInfo> {
    let package = app.package_info();
    Ok(AppInfo {
        name: package.name.clone(),
        version: package.version.to_string(),
        identifier: app.config().identifier.clone(),
        database_path: state.database_path.display().to_string(),
        schema_version: state.db.schema_version(),
    })
}
