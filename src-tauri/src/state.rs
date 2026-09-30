//! Estado global gerenciado pelo Tauri.

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Manager};

use crate::db::{Database, DATABASE_FILE_NAME};
use crate::error::AppResult;
use crate::platform::devices::{DeviceReader, SaveReading};
use crate::platform::system_monitor::SystemMonitor;
use crate::services;
use crate::services::disk_usage::{DiskUsageRun, DiskUsageStore};
use crate::services::finance_import::ImportPreviewStore;
use crate::services::optimization::{CleanupRun, CleanupScanStore};

/// Subpasta de Documentos onde ficam os backups do banco.
const BACKUP_FOLDER: [&str; 2] = ["Zona de Controle", "Backups"];

pub struct AppState {
    /// Compartilhado com a escuta dos receptores, que grava a última leitura.
    pub db: Arc<Database>,
    pub database_path: PathBuf,
    /// Pasta dos backups: `Documentos/Zona de Controle/Backups` (fora da pasta
    /// interna do app, fácil de achar e copiar). Sem Documentos, usa a pasta de dados.
    pub backup_dir: PathBuf,
    /// Leitura de receptores USB, controles Xbox e bateria Bluetooth.
    pub device_reader: DeviceReader,
    /// Leitura ao vivo de CPU, memória, discos e processos (nada é persistido).
    pub system_monitor: SystemMonitor,
    /// AppData\Local do usuário: base da allowlist da limpeza.
    pub local_app_data: PathBuf,
    /// Última análise da limpeza (só em memória).
    pub cleanup_scans: Arc<CleanupScanStore>,
    /// Limpeza em andamento (progresso e cancelamento).
    pub cleanup_run: Arc<CleanupRun>,
    /// Última análise do Espaço em disco (só em memória).
    pub disk_usage_scans: Arc<DiskUsageStore>,
    /// Análise do Espaço em disco em andamento (progresso e cancelamento).
    pub disk_usage_run: Arc<DiskUsageRun>,
    /// Última prévia de importação de extrato (só em memória).
    pub import_previews: ImportPreviewStore,
}

impl AppState {
    /// Cria o diretório de dados do app (se necessário), abre o banco e
    /// aplica as migrations.
    pub fn initialize(app: &AppHandle) -> AppResult<Self> {
        let data_dir = app.path().app_data_dir()?;
        fs::create_dir_all(&data_dir)?;

        let database_path = data_dir.join(DATABASE_FILE_NAME);
        let db = Arc::new(Database::open(&database_path)?);
        let backup_dir = app
            .path()
            .document_dir()
            .map(|documents| {
                BACKUP_FOLDER
                    .iter()
                    .fold(documents, |path, part| path.join(part))
            })
            .unwrap_or_else(|_| data_dir.join("backups"));

        let local_app_data = app.path().local_data_dir()?;

        let device_reader = DeviceReader::new();
        // Última leitura de cada modelo: aparece como "último registro" até o
        // primeiro aviso novo. Sem ela (erro ao ler), só fica "aguardando".
        if let Ok(saved) = services::devices::saved_model_readings(&db) {
            let _ = device_reader.seed_readings(saved);
        }
        // Escuta passiva dos receptores com leitor de bateria (headset MCHOSE,
        // mouse Rapoo), gravando a leitura quando muda.
        let save_db = Arc::clone(&db);
        let save: SaveReading = Arc::new(move |key, reading| {
            // Falhar ao gravar só perde o registro para a próxima abertura.
            let _ = services::devices::save_model_reading(&save_db, key, reading);
        });
        device_reader.start_listeners(save);

        Ok(Self {
            db,
            database_path,
            backup_dir,
            device_reader,
            system_monitor: SystemMonitor::new(),
            local_app_data,
            cleanup_scans: Arc::new(CleanupScanStore::new()),
            cleanup_run: Arc::new(CleanupRun::new()),
            disk_usage_scans: Arc::new(DiskUsageStore::new()),
            disk_usage_run: Arc::new(DiskUsageRun::new()),
            import_previews: ImportPreviewStore::new(),
        })
    }
}
