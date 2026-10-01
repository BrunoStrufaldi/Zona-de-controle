//! Casos de uso da atualização do app: backup antes de instalar, andamento,
//! auditoria (sucesso e falha) e o registro da versão ao abrir.
//!
//! A rede e o instalador ficam no command (`commands/app_update.rs`), com o
//! `tauri-plugin-updater`; aqui só o que não depende dele, para ser testável.

use std::path::Path;
use std::sync::Mutex;

use serde_json::{json, Value};

use crate::db::Database;
use crate::domain::app_update::{
    version_change, UpdateProgress, UpdateStage, INSTALLED_VERSION_SETTING_KEY, UPDATED_ACTION,
    UPDATE_INSTALL_ACTION,
};
use crate::domain::audit::{AuditCategory, AuditOutcome, NewAuditEntry};
use crate::domain::backup::BackupFile;
use crate::error::{AppError, AppResult};
use crate::repositories::{audit, settings};
use crate::services::backup;

/// Atualização em andamento (só uma por vez). O andamento é consultado pela
/// tela a cada 300 ms, como na limpeza.
#[derive(Default)]
pub struct UpdateRun {
    progress: Mutex<Option<UpdateProgress>>,
}

/// Enquanto existir, marca a atualização como em andamento.
pub struct UpdateGuard<'a>(&'a UpdateRun);

impl Drop for UpdateGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut progress) = self.0.progress.lock() {
            *progress = None;
        }
    }
}

impl UpdateRun {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn begin(&self) -> AppResult<UpdateGuard<'_>> {
        let mut progress = self.progress.lock().map_err(|_| AppError::StatePoisoned)?;
        if progress.is_some() {
            return Err(AppError::Validation(
                "Já existe uma atualização em andamento.".into(),
            ));
        }
        *progress = Some(UpdateProgress {
            stage: UpdateStage::Backup,
            downloaded_bytes: 0,
            total_bytes: None,
        });
        Ok(UpdateGuard(self))
    }

    pub fn set_stage(&self, stage: UpdateStage) {
        self.update(|progress| progress.stage = stage);
    }

    /// Soma um pedaço baixado (o plugin avisa a cada pedaço, com o total se souber).
    pub fn add_downloaded(&self, chunk: usize, total: Option<u64>) {
        self.update(|progress| {
            progress.downloaded_bytes = progress
                .downloaded_bytes
                .saturating_add(u64::try_from(chunk).unwrap_or(u64::MAX));
            progress.total_bytes = total;
        });
    }

    pub fn progress(&self) -> AppResult<Option<UpdateProgress>> {
        Ok(self
            .progress
            .lock()
            .map_err(|_| AppError::StatePoisoned)?
            .clone())
    }

    fn update(&self, change: impl FnOnce(&mut UpdateProgress)) {
        if let Ok(mut progress) = self.progress.lock() {
            if let Some(progress) = progress.as_mut() {
                change(progress);
            }
        }
    }
}

/// Primeira etapa da instalação: backup do banco. Sem backup, a atualização
/// não continua (e a falha é auditada).
pub fn backup_before_install(
    db: &Database,
    backup_dir: &Path,
    from: &str,
    to: &str,
) -> AppResult<BackupFile> {
    backup::create_backup(db, backup_dir).map_err(|error| {
        let message =
            format!("Não foi possível fazer o backup do banco; nada foi instalado. ({error})");
        record_install_failure(db, from, to, UpdateStage::Backup, &message);
        AppError::Update(message)
    })
}

/// Instalador baixado e com a assinatura conferida: registra antes de abri-lo,
/// porque no Windows o app fecha em seguida.
pub fn record_install_ready(
    db: &Database,
    from: &str,
    to: &str,
    backup: &BackupFile,
) -> AppResult<()> {
    record(
        db,
        to,
        AuditOutcome::Success,
        json!({ "from": from, "to": to, "backup": backup.file_name }),
    )
}

/// Falha em qualquer etapa. Melhor esforço: o erro original é o relevante.
pub fn record_install_failure(
    db: &Database,
    from: &str,
    to: &str,
    stage: UpdateStage,
    error: &str,
) {
    let _ = record(
        db,
        to,
        AuditOutcome::Failure,
        json!({ "from": from, "to": to, "stage": stage.as_str(), "error": error }),
    );
}

fn record(db: &Database, to: &str, outcome: AuditOutcome, details: Value) -> AppResult<()> {
    db.with_connection(|connection| {
        audit::record(
            connection,
            &NewAuditEntry {
                category: AuditCategory::App,
                action: UPDATE_INSTALL_ACTION,
                target: Some(to),
                outcome,
                details: Some(details),
            },
        )
    })
}

/// Ao abrir: guarda a versão atual e, se ela mudou desde a última abertura,
/// audita a atualização e devolve a versão anterior (a tela avisa uma vez).
pub fn record_startup_version(db: &Database, current: &str) -> AppResult<Option<String>> {
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let saved = settings::find(&transaction, INSTALLED_VERSION_SETTING_KEY)?
            .and_then(|entry| entry.value.as_str().map(str::to_owned));
        if saved.as_deref() == Some(current) {
            return Ok(None);
        }

        let previous = version_change(saved.as_deref(), current);
        settings::upsert(
            &transaction,
            INSTALLED_VERSION_SETTING_KEY,
            &serde_json::to_string(current)?,
        )?;
        if let Some(from) = &previous {
            audit::record(
                &transaction,
                &NewAuditEntry {
                    category: AuditCategory::App,
                    action: UPDATED_ACTION,
                    target: Some(current),
                    outcome: AuditOutcome::Success,
                    details: Some(json!({ "from": from, "to": current })),
                },
            )?;
        }
        transaction.commit()?;
        Ok(previous)
    })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;
    use crate::repositories::audit::AuditEntry;

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(name: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            Self(std::env::temp_dir().join(format!("zdc-{name}-{nanos}")))
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
            let _ = fs::remove_file(&self.0);
        }
    }

    fn entries(db: &Database, action: &str) -> Vec<AuditEntry> {
        db.with_connection(|connection| audit::list_recent(connection, 50))
            .unwrap()
            .into_iter()
            .filter(|entry| entry.action == action)
            .collect()
    }

    #[test]
    fn first_launch_saves_the_version_without_an_update_record() {
        let db = Database::open_in_memory().unwrap();

        assert_eq!(record_startup_version(&db, "0.2.0").unwrap(), None);
        assert_eq!(record_startup_version(&db, "0.2.0").unwrap(), None);
        assert!(entries(&db, UPDATED_ACTION).is_empty());
        let saved = db
            .with_connection(|connection| settings::find(connection, INSTALLED_VERSION_SETTING_KEY))
            .unwrap()
            .unwrap();
        assert_eq!(saved.value, json!("0.2.0"));
    }

    #[test]
    fn a_new_version_is_audited_once_and_returns_the_previous() {
        let db = Database::open_in_memory().unwrap();
        record_startup_version(&db, "0.1.0").unwrap();

        assert_eq!(
            record_startup_version(&db, "0.2.0").unwrap(),
            Some("0.1.0".into())
        );
        assert_eq!(record_startup_version(&db, "0.2.0").unwrap(), None);

        let updated = entries(&db, UPDATED_ACTION);
        assert_eq!(updated.len(), 1);
        assert_eq!(updated[0].category, "app");
        assert_eq!(updated[0].target.as_deref(), Some("0.2.0"));
        assert_eq!(
            updated[0].details,
            Some(json!({ "from": "0.1.0", "to": "0.2.0" }))
        );
    }

    #[test]
    fn backup_comes_first_and_the_ready_record_names_it() {
        let dir = TempDir::new("update-backup");
        let db = Database::open_in_memory().unwrap();

        let file = backup_before_install(&db, &dir.0, "0.1.0", "0.2.0").unwrap();
        assert!(Path::new(&file.path).exists());
        record_install_ready(&db, "0.1.0", "0.2.0", &file).unwrap();

        let records = entries(&db, UPDATE_INSTALL_ACTION);
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].outcome, "success");
        assert_eq!(
            records[0].details,
            Some(json!({ "from": "0.1.0", "to": "0.2.0", "backup": file.file_name }))
        );
    }

    #[test]
    fn a_failed_backup_stops_the_update_and_is_audited() {
        // Um arquivo no lugar da pasta: o backup não consegue ser criado.
        let blocker = TempDir::new("update-blocker");
        fs::write(&blocker.0, b"x").unwrap();
        let db = Database::open_in_memory().unwrap();

        let error = backup_before_install(&db, &blocker.0, "0.1.0", "0.2.0").unwrap_err();
        assert_eq!(error.kind(), "update");
        assert!(error.to_string().contains("nada foi instalado"));

        let records = entries(&db, UPDATE_INSTALL_ACTION);
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].outcome, "failure");
        assert_eq!(records[0].details.as_ref().unwrap()["stage"], "backup");
    }

    #[test]
    fn only_one_update_runs_at_a_time_and_progress_clears_at_the_end() {
        let run = UpdateRun::new();
        {
            let _guard = run.begin().unwrap();
            assert!(run.begin().is_err());

            run.set_stage(UpdateStage::Downloading);
            run.add_downloaded(100, Some(1_000));
            run.add_downloaded(50, Some(1_000));
            assert_eq!(
                run.progress().unwrap(),
                Some(UpdateProgress {
                    stage: UpdateStage::Downloading,
                    downloaded_bytes: 150,
                    total_bytes: Some(1_000),
                })
            );
        }
        assert_eq!(run.progress().unwrap(), None);
        assert!(run.begin().is_ok());
    }
}
