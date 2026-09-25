//! Estado global gerenciado pelo Tauri.

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::db::{Database, DATABASE_FILE_NAME};
use crate::domain::devices::BatteryProviderRegistry;
use crate::error::AppResult;

pub struct AppState {
    pub db: Database,
    pub database_path: PathBuf,
    pub battery_providers: BatteryProviderRegistry,
}

impl AppState {
    /// Cria o diretório de dados do app (se necessário), abre o banco e
    /// aplica as migrations.
    pub fn initialize(app: &AppHandle) -> AppResult<Self> {
        let data_dir = app.path().app_data_dir()?;
        fs::create_dir_all(&data_dir)?;

        let database_path = data_dir.join(DATABASE_FILE_NAME);
        let db = Database::open(&database_path)?;

        Ok(Self {
            db,
            database_path,
            battery_providers: BatteryProviderRegistry::with_default_providers(),
        })
    }
}
