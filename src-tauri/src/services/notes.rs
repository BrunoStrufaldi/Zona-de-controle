//! Casos de uso de notas: validação, histórico automático de versões e
//! auditoria das exclusões (nota e pasta).

use rusqlite::Connection;
use serde_json::{json, Value};

use crate::db::Database;
use crate::domain::audit::{AuditCategory, AuditOutcome, NewAuditEntry};
use crate::domain::notes::{
    display_title, validate_folder_name, Note, NoteFolder, NoteInput, NoteVersion, MAX_FOLDERS,
};
use crate::error::{AppError, AppResult};
use crate::repositories::notes::{FOLDER_NOT_FOUND, NOTE_NOT_FOUND};
use crate::repositories::{audit, notes};

const ACTION_NOTE_DELETED: &str = "note.deleted";
const ACTION_FOLDER_DELETED: &str = "note_folder.deleted";

pub fn list_notes(db: &Database) -> AppResult<Vec<Note>> {
    db.with_connection(|connection| notes::list(connection))
}

pub fn create_note(db: &Database, input: NoteInput) -> AppResult<Note> {
    let note = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let id = notes::insert(&transaction, &note)?;
        let created = load(&transaction, id)?;
        transaction.commit()?;
        Ok(created)
    })
}

/// Salva a nota. Antes de sobrescrever, guarda o estado anterior no histórico
/// quando o texto mudou e a última versão tem mais que o intervalo mínimo.
pub fn update_note(db: &Database, id: i64, input: NoteInput) -> AppResult<Note> {
    let note = input.validate()?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let current = load(&transaction, id)?;
        let text_changed = current.title != note.title || current.content != note.content;
        let has_text = !(current.title.is_empty() && current.content.is_empty());
        if text_changed && has_text && notes::version_due(&transaction, id)? {
            notes::insert_version(&transaction, id, &current.title, &current.content)?;
        }
        notes::update(&transaction, id, &note)?;
        let updated = load(&transaction, id)?;
        transaction.commit()?;
        Ok(updated)
    })
}

pub fn set_note_favorite(db: &Database, id: i64, favorite: bool) -> AppResult<Note> {
    db.with_connection(|connection| {
        notes::set_favorite(connection, id, favorite)?;
        load(connection, id)
    })
}

pub fn list_versions(db: &Database, note_id: i64) -> AppResult<Vec<NoteVersion>> {
    db.with_connection(|connection| {
        load(connection, note_id)?;
        notes::list_versions(connection, note_id)
    })
}

/// Volta a nota para uma versão. O estado atual entra no histórico antes (se
/// diferente), então restaurar também pode ser desfeito.
pub fn restore_version(db: &Database, version_id: i64) -> AppResult<Note> {
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let version = notes::find_version(&transaction, version_id)?;
        let current = load(&transaction, version.note_id)?;
        if current.title != version.title || current.content != version.content {
            notes::insert_version(&transaction, current.id, &current.title, &current.content)?;
        }
        notes::restore_content(&transaction, current.id, &version.title, &version.content)?;
        let restored = load(&transaction, current.id)?;
        transaction.commit()?;
        Ok(restored)
    })
}

/// Exclusão definitiva (com versões). Confirmada na interface e auditada.
pub fn delete_note(db: &Database, id: i64) -> AppResult<()> {
    db.with_connection(|connection| {
        audited_delete(connection, ACTION_NOTE_DELETED, id, |transaction| {
            let note = notes::delete(transaction, id)?;
            Ok(json!({
                "title": display_title(&note.title, note.journal_date.as_deref()),
            }))
        })
    })
}

pub fn list_folders(db: &Database) -> AppResult<Vec<NoteFolder>> {
    db.with_connection(|connection| notes::list_folders(connection))
}

pub fn create_folder(db: &Database, name: &str) -> AppResult<NoteFolder> {
    let name = validate_folder_name(name)?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        if notes::count_folders(&transaction)? >= MAX_FOLDERS {
            return Err(AppError::Validation(format!(
                "é possível ter no máximo {MAX_FOLDERS} pastas"
            )));
        }
        let id = notes::insert_folder(&transaction, &name)?;
        let created = load_folder(&transaction, id)?;
        transaction.commit()?;
        Ok(created)
    })
}

pub fn rename_folder(db: &Database, id: i64, name: &str) -> AppResult<NoteFolder> {
    let name = validate_folder_name(name)?;
    db.with_connection(|connection| {
        let transaction = connection.transaction()?;
        notes::rename_folder(&transaction, id, &name)?;
        let renamed = load_folder(&transaction, id)?;
        transaction.commit()?;
        Ok(renamed)
    })
}

/// Exclusão definitiva da pasta; as notas ficam sem pasta. Confirmada na
/// interface e auditada.
pub fn delete_folder(db: &Database, id: i64) -> AppResult<()> {
    db.with_connection(|connection| {
        audited_delete(connection, ACTION_FOLDER_DELETED, id, |transaction| {
            let folder = notes::delete_folder(transaction, id)?;
            Ok(json!({ "name": folder.name, "notesDetached": folder.note_count }))
        })
    })
}

/// Executa a exclusão numa transação que também grava a auditoria; em caso de
/// falha, registra a falha (melhor esforço) e devolve o erro original.
fn audited_delete(
    connection: &mut Connection,
    action: &str,
    id: i64,
    delete: impl FnOnce(&Connection) -> AppResult<Value>,
) -> AppResult<()> {
    let target = id.to_string();
    let result: AppResult<()> = (|| {
        let transaction = connection.transaction()?;
        let details = delete(&transaction)?;
        audit::record(
            &transaction,
            &NewAuditEntry {
                category: AuditCategory::Notes,
                action,
                target: Some(&target),
                outcome: AuditOutcome::Success,
                details: Some(details),
            },
        )?;
        transaction.commit()?;
        Ok(())
    })();
    if let Err(error) = &result {
        let _ = audit::record(
            connection,
            &NewAuditEntry {
                category: AuditCategory::Notes,
                action,
                target: Some(&target),
                outcome: AuditOutcome::Failure,
                details: Some(json!({ "error": error.to_string() })),
            },
        );
    }
    result
}

fn load(connection: &Connection, id: i64) -> AppResult<Note> {
    notes::find(connection, id)?.ok_or(AppError::NotFound(NOTE_NOT_FOUND))
}

fn load_folder(connection: &Connection, id: i64) -> AppResult<NoteFolder> {
    notes::find_folder(connection, id)?.ok_or(AppError::NotFound(FOLDER_NOT_FOUND))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(title: &str, content: &str) -> NoteInput {
        NoteInput {
            title: title.into(),
            content: content.into(),
            folder_id: None,
            tags: Vec::new(),
            journal_date: None,
        }
    }

    fn audit_log(db: &Database) -> Vec<audit::AuditEntry> {
        db.with_connection(|connection| audit::list_recent(connection, 10))
            .unwrap()
    }

    #[test]
    fn versions_the_previous_text_at_most_once_per_interval() {
        let db = Database::open_in_memory().unwrap();
        let note = create_note(&db, input("", "")).unwrap();

        // A primeira edição de uma nota vazia não gera versão.
        update_note(&db, note.id, input("Plano", "v1")).unwrap();
        assert!(list_versions(&db, note.id).unwrap().is_empty());

        update_note(&db, note.id, input("Plano", "v2")).unwrap();
        // Dentro do intervalo: só a primeira alteração vira versão.
        update_note(&db, note.id, input("Plano", "v3")).unwrap();
        let versions = list_versions(&db, note.id).unwrap();
        assert_eq!(versions.len(), 1);
        assert_eq!(versions[0].content, "v1");

        // Salvar sem mudar o texto não gera versão.
        db.with_connection(|connection| {
            connection.execute(
                "UPDATE note_versions SET created_at = '2000-01-01T00:00:00Z'",
                [],
            )?;
            Ok(())
        })
        .unwrap();
        update_note(&db, note.id, input("Plano", "v3")).unwrap();
        assert_eq!(list_versions(&db, note.id).unwrap().len(), 1);
    }

    #[test]
    fn restoring_a_version_keeps_the_current_text_in_history() {
        let db = Database::open_in_memory().unwrap();
        let note = create_note(&db, input("Plano", "original")).unwrap();
        update_note(&db, note.id, input("Plano", "reescrito")).unwrap();
        let original = list_versions(&db, note.id).unwrap()[0].clone();

        let restored = restore_version(&db, original.id).unwrap();

        assert_eq!(restored.content, "original");
        let history: Vec<_> = list_versions(&db, note.id)
            .unwrap()
            .into_iter()
            .map(|version| version.content)
            .collect();
        assert!(history.contains(&"reescrito".to_string()));
        assert!(matches!(
            restore_version(&db, 999),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn favorite_does_not_change_the_edit_date() {
        let db = Database::open_in_memory().unwrap();
        let note = create_note(&db, input("Ideias", "")).unwrap();

        let favorite = set_note_favorite(&db, note.id, true).unwrap();

        assert!(favorite.favorite);
        assert_eq!(favorite.updated_at, note.updated_at);
    }

    #[test]
    fn deletes_are_audited() {
        let db = Database::open_in_memory().unwrap();
        let folder = create_folder(&db, "Estudos").unwrap();
        let mut journal = input("", "Dia tranquilo");
        journal.journal_date = Some("2026-09-25".into());
        let note = create_note(&db, journal).unwrap();

        delete_note(&db, note.id).unwrap();
        delete_folder(&db, folder.id).unwrap();
        assert!(delete_note(&db, note.id).is_err());

        let log = audit_log(&db);
        assert_eq!(log.len(), 3);
        assert_eq!(log[0].outcome, "failure");
        assert_eq!(log[1].action, ACTION_FOLDER_DELETED);
        assert_eq!(
            log[1].details,
            Some(json!({ "name": "Estudos", "notesDetached": 0 }))
        );
        assert_eq!(log[2].category, "notes");
        assert_eq!(
            log[2].details,
            Some(json!({ "title": "Diário de 2026-09-25" }))
        );
    }
}
