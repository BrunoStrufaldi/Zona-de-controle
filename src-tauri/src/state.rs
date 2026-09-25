//! Estado global gerenciado pelo Tauri.

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::db::{Database, DATABASE_FILE_NAME};
use crate::domain::devices::BatteryProviderRegistry;
use crate::error::AppResult;

/// Subpasta de Documentos onde ficam os backups do banco.
const BACKUP_FOLDER: [&str; 2] = ["Zona de Controle", "Backups"];

pub struct AppState {
    pub db: Database,
    pub database_path: PathBuf,
    /// Pasta dos backups: `Documentos/Zona de Controle/Backups` (fora da pasta
    /// interna do app, fácil de achar e copiar). Sem Documentos, usa a pasta de dados.
    pub backup_dir: PathBuf,
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
        let backup_dir = app
            .path()
            .document_dir()
            .map(|documents| {
                BACKUP_FOLDER
                    .iter()
                    .fold(documents, |path, part| path.join(part))
            })
            .unwrap_or_else(|_| data_dir.join("backups"));

        Ok(Self {
            db,
            database_path,
            backup_dir,
            battery_providers: BatteryProviderRegistry::with_default_providers(),
        })
    }
}
