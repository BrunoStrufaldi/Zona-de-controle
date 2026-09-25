//! Backup do banco: cria cópias na pasta de backups e lista as existentes.
//! Não há exclusão nem restauração automáticas — restaurar é substituir o
//! arquivo do banco com o app fechado (documentado na tela).

use std::fs;
use std::path::Path;

use serde_json::json;

use crate::db::Database;
use crate::domain::audit::{AuditCategory, AuditOutcome, NewAuditEntry};
use crate::domain::backup::{self, BackupFile, BackupOverview};
use crate::error::{AppError, AppResult};
use crate::repositories::{audit, backup as repository};

const ACTION_CREATED: &str = "database.backup_created";
/// Tentativas de nome quando já existe um backup no mesmo segundo.
const MAX_NAME_ATTEMPTS: u32 = 100;

/// Cria um backup em `directory` (criada se preciso). Sucesso e falha vão
/// para o log de auditoria. Um arquivo incompleto é removido em caso de falha.
pub fn create_backup(db: &Database, directory: &Path) -> AppResult<BackupFile> {
    db.with_connection(|connection| {
        let result = (|| {
            fs::create_dir_all(directory)?;
            let timestamp = repository::local_timestamp(connection)?;
            let target = (0..MAX_NAME_ATTEMPTS)
                .map(|attempt| directory.join(backup::file_name_for(&timestamp, attempt)))
                .find(|path| !path.exists())
                .ok_or_else(|| {
                    AppError::Validation("já existem backups demais neste segundo".into())
                })?;

            let written = repository::vacuum_into(connection, &target)
                .and_then(|()| repository::verify(&target))
                .and_then(|()| describe(&target));
            if written.is_err() && target.exists() {
                // Só remove o arquivo que esta operação acabou de criar.
                let _ = fs::remove_file(&target);
            }
            written
        })();

        let (target, outcome, details) = match &result {
            Ok(file) => (
                Some(file.file_name.clone()),
                AuditOutcome::Success,
                json!({ "path": file.path, "sizeBytes": file.size_bytes }),
            ),
            Err(error) => (
                None,
                AuditOutcome::Failure,
                json!({ "directory": directory.display().to_string(), "error": error.to_string() }),
            ),
        };
        // Melhor esforço na falha: o erro original é o relevante para o chamador.
        let recorded = audit::record(
            connection,
            &NewAuditEntry {
                category: AuditCategory::Database,
                action: ACTION_CREATED,
                target: target.as_deref(),
                outcome,
                details: Some(details),
            },
        );
        let file = result?;
        recorded?;
        Ok(file)
    })
}

/// Backups existentes em `directory`, mais recentes primeiro. Pasta ausente = lista vazia.
pub fn list_backups(directory: &Path) -> AppResult<BackupOverview> {
    let mut backups = Vec::new();
    if directory.is_dir() {
        for entry in fs::read_dir(directory)? {
            let path = entry?.path();
            if path.is_file() {
                if let Ok(file) = describe(&path) {
                    backups.push(file);
                }
            }
        }
    }
    backups.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then(b.file_name.cmp(&a.file_name))
    });
    Ok(BackupOverview {
        directory: directory.display().to_string(),
        backups,
    })
}

fn describe(path: &Path) -> AppResult<BackupFile> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string();
    let created_at = backup::parse_created_at(&file_name)
        .ok_or_else(|| AppError::Validation("arquivo não é um backup do app".into()))?;
    Ok(BackupFile {
        size_bytes: fs::metadata(path)?.len(),
        path: path.display().to_string(),
        file_name,
        created_at,
    })
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use rusqlite::Connection;

    use super::*;

    /// Pasta temporária exclusiva do teste, apagada ao final.
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
        }
    }

    #[test]
    fn creates_a_readable_copy_and_audits_it() {
        let dir = TempDir::new("backup");
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| {
            connection.execute(
                "INSERT INTO app_settings (key, value) VALUES ('profile.display_name', '\"Ana\"')",
                [],
            )?;
            Ok(())
        })
        .unwrap();

        let first = create_backup(&db, &dir.0).unwrap();
        let second = create_backup(&db, &dir.0).unwrap();
        assert_ne!(first.file_name, second.file_name, "nomes nunca colidem");
        assert!(first.size_bytes > 0);

        let copy = Connection::open(&first.path).unwrap();
        let name: String = copy
            .query_row("SELECT value FROM app_settings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(name, "\"Ana\"");

        let log = db
            .with_connection(|connection| audit::list_recent(connection, 10))
            .unwrap();
        assert_eq!(log.len(), 2);
        assert_eq!(log[0].category, "database");
        assert_eq!(log[0].action, ACTION_CREATED);
        assert_eq!(log[0].outcome, "success");
    }

    #[test]
    fn lists_only_backup_files_newest_first() {
        let dir = TempDir::new("list");
        assert!(list_backups(&dir.0).unwrap().backups.is_empty());

        fs::create_dir_all(&dir.0).unwrap();
        for name in [
            "zona-de-controle-2026-09-24_080000.db",
            "zona-de-controle-2026-09-25_080000.db",
            "anotacoes.txt",
            "zona-de-controle.db",
        ] {
            fs::write(dir.0.join(name), b"x").unwrap();
        }

        let overview = list_backups(&dir.0).unwrap();
        let names: Vec<_> = overview
            .backups
            .iter()
            .map(|b| b.file_name.as_str())
            .collect();
        assert_eq!(
            names,
            vec![
                "zona-de-controle-2026-09-25_080000.db",
                "zona-de-controle-2026-09-24_080000.db"
            ]
        );
        assert_eq!(overview.backups[0].created_at, "2026-09-25T08:00:00");
    }

    #[test]
    fn failure_is_audited() {
        let dir = TempDir::new("fail");
        // Um arquivo no lugar da pasta impede a criação do diretório.
        fs::write(&dir.0, b"x").unwrap();
        let db = Database::open_in_memory().unwrap();

        assert!(create_backup(&db, &dir.0).is_err());

        let log = db
            .with_connection(|connection| audit::list_recent(connection, 10))
            .unwrap();
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].outcome, "failure");
        let _ = fs::remove_file(&dir.0);
    }
}
