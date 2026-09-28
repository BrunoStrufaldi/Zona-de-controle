//! Estado global gerenciado pelo Tauri.

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::db::{Database, DATABASE_FILE_NAME};
use crate::error::AppResult;
use crate::platform::devices::DeviceReader;
use crate::platform::system_monitor::SystemMonitor;

/// Subpasta de Documentos onde ficam os backups do banco.
const BACKUP_FOLDER: [&str; 2] = ["Zona de Controle", "Backups"];

pub struct AppState {
    pub db: Database,
    pub database_path: PathBuf,
    /// Pasta dos backups: `Documentos/Zona de Controle/Backups` (fora da pasta
    /// interna do app, fácil de achar e copiar). Sem Documentos, usa a pasta de dados.
    pub backup_dir: PathBuf,
    /// Leitura de receptores USB, controles Xbox e bateria Bluetooth.
    pub device_reader: DeviceReader,
    /// Leitura ao vivo de CPU, memória, discos e processos (nada é persistido).
    pub system_monitor: SystemMonitor,
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

        let device_reader = DeviceReader::new();
        // Escuta passiva dos receptores com leitor de bateria (ex.: headset MCHOSE).
        device_reader.start_listeners();

        Ok(Self {
            db,
            database_path,
            backup_dir,
            device_reader,
            system_monitor: SystemMonitor::new(),
        })
    }
}
