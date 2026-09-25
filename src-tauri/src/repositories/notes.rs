//! Acesso às tabelas `notes`, `note_tags`, `note_versions` e `note_folders`.

use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::domain::notes::{
    Note, NoteFolder, NoteVersion, ValidNote, MAX_VERSIONS_PER_NOTE, VERSION_INTERVAL_MINUTES,
};
use crate::error::{AppError, AppResult};

pub const NOTE_NOT_FOUND: &str = "nota não encontrada";
pub const FOLDER_NOT_FOUND: &str = "pasta não encontrada";
const VERSION_NOT_FOUND: &str = "versão não encontrada";

const SELECT_NOTE: &str = "SELECT id, title, content, folder_id, favorite, journal_date,
       created_at, updated_at
FROM notes";

fn note_from_row(row: &Row<'_>) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        folder_id: row.get(3)?,
        favorite: row.get(4)?,
        journal_date: row.get(5)?,
        tags: Vec::new(),
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

/// Todas as notas, das editadas mais recentemente para as mais antigas.
pub fn list(connection: &Connection) -> AppResult<Vec<Note>> {
    let mut statement =
        connection.prepare(&format!("{SELECT_NOTE} ORDER BY updated_at DESC, id DESC"))?;
    let mut notes = statement
        .query_map([], note_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut tags = tags_by_note(connection)?;
    for note in &mut notes {
        note.tags = tags.remove(&note.id).unwrap_or_default();
    }
    Ok(notes)
}

pub fn find(connection: &Connection, id: i64) -> AppResult<Option<Note>> {
    let note = connection
        .query_row(&format!("{SELECT_NOTE} WHERE id = ?1"), [id], note_from_row)
        .optional()?;
    match note {
        Some(mut note) => {
            note.tags = tags_of(connection, id)?;
            Ok(Some(note))
        }
        None => Ok(None),
    }
}

pub fn insert(connection: &Connection, note: &ValidNote) -> AppResult<i64> {
    ensure_folder_exists(connection, note.folder_id)?;
    if let Some(date) = &note.journal_date {
        let exists: bool = connection.query_row(
            "SELECT EXISTS (SELECT 1 FROM notes WHERE journal_date = ?1)",
            [date],
            |row| row.get(0),
        )?;
        if exists {
            return Err(AppError::Validation(format!(
                "já existe uma entrada de diário para {date}"
            )));
        }
    }
    connection.execute(
        "INSERT INTO notes (title, content, folder_id, journal_date) VALUES (?1, ?2, ?3, ?4)",
        params![note.title, note.content, note.folder_id, note.journal_date],
    )?;
    let id = connection.last_insert_rowid();
    replace_tags(connection, id, &note.tags)?;
    Ok(id)
}

/// Substitui título, conteúdo, pasta e tags (a data do diário não muda).
pub fn update(connection: &Connection, id: i64, note: &ValidNote) -> AppResult<()> {
    ensure_folder_exists(connection, note.folder_id)?;
    let changed = connection.execute(
        "UPDATE notes
         SET title = ?2, content = ?3, folder_id = ?4,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        params![id, note.title, note.content, note.folder_id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(NOTE_NOT_FOUND));
    }
    replace_tags(connection, id, &note.tags)
}

/// Favoritar não altera `updated_at` (não é uma edição do conteúdo).
pub fn set_favorite(connection: &Connection, id: i64, favorite: bool) -> AppResult<()> {
    let changed = connection.execute(
        "UPDATE notes SET favorite = ?2 WHERE id = ?1",
        params![id, favorite],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(NOTE_NOT_FOUND));
    }
    Ok(())
}

/// Exclui a nota (tags e versões saem em cascata). Retorna a nota excluída.
pub fn delete(connection: &Connection, id: i64) -> AppResult<Note> {
    let note = find(connection, id)?.ok_or(AppError::NotFound(NOTE_NOT_FOUND))?;
    connection.execute("DELETE FROM notes WHERE id = ?1", [id])?;
    Ok(note)
}

// ---- Versões ---------------------------------------------------------------

/// A última versão da nota é mais antiga que o intervalo mínimo (ou não existe)?
pub fn version_due(connection: &Connection, note_id: i64) -> AppResult<bool> {
    let recent: bool = connection.query_row(
        "SELECT EXISTS (
             SELECT 1 FROM note_versions
             WHERE note_id = ?1
               AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?2)
         )",
        params![note_id, format!("-{VERSION_INTERVAL_MINUTES} minutes")],
        |row| row.get(0),
    )?;
    Ok(!recent)
}

/// Grava uma versão e descarta as excedentes (mantém as mais recentes).
pub fn insert_version(
    connection: &Connection,
    note_id: i64,
    title: &str,
    content: &str,
) -> AppResult<()> {
    connection.execute(
        "INSERT INTO note_versions (note_id, title, content) VALUES (?1, ?2, ?3)",
        params![note_id, title, content],
    )?;
    connection.execute(
        "DELETE FROM note_versions
         WHERE note_id = ?1 AND id NOT IN (
             SELECT id FROM note_versions WHERE note_id = ?1
             ORDER BY created_at DESC, id DESC LIMIT ?2
         )",
        params![note_id, MAX_VERSIONS_PER_NOTE as i64],
    )?;
    Ok(())
}

/// Versões da nota, mais recentes primeiro.
pub fn list_versions(connection: &Connection, note_id: i64) -> AppResult<Vec<NoteVersion>> {
    let mut statement = connection.prepare(
        "SELECT id, note_id, title, content, created_at FROM note_versions
         WHERE note_id = ?1 ORDER BY created_at DESC, id DESC",
    )?;
    let versions = statement
        .query_map([note_id], version_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(versions)
}

pub fn find_version(connection: &Connection, version_id: i64) -> AppResult<NoteVersion> {
    connection
        .query_row(
            "SELECT id, note_id, title, content, created_at FROM note_versions WHERE id = ?1",
            [version_id],
            version_from_row,
        )
        .optional()?
        .ok_or(AppError::NotFound(VERSION_NOT_FOUND))
}

/// Volta título e conteúdo para os de uma versão (pasta e tags ficam como estão).
pub fn restore_content(
    connection: &Connection,
    note_id: i64,
    title: &str,
    content: &str,
) -> AppResult<()> {
    connection.execute(
        "UPDATE notes
         SET title = ?2, content = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        params![note_id, title, content],
    )?;
    Ok(())
}

fn version_from_row(row: &Row<'_>) -> rusqlite::Result<NoteVersion> {
    Ok(NoteVersion {
        id: row.get(0)?,
        note_id: row.get(1)?,
        title: row.get(2)?,
        content: row.get(3)?,
        created_at: row.get(4)?,
    })
}

// ---- Pastas ----------------------------------------------------------------

/// Pastas em ordem alfabética, com a quantidade de notas de cada uma.
pub fn list_folders(connection: &Connection) -> AppResult<Vec<NoteFolder>> {
    let mut statement = connection.prepare(
        "SELECT f.id, f.name, (SELECT COUNT(*) FROM notes n WHERE n.folder_id = f.id)
         FROM note_folders f
         ORDER BY f.name COLLATE NOCASE, f.id",
    )?;
    let folders = statement
        .query_map([], |row| {
            Ok(NoteFolder {
                id: row.get(0)?,
                name: row.get(1)?,
                note_count: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(folders)
}

pub fn find_folder(connection: &Connection, id: i64) -> AppResult<Option<NoteFolder>> {
    Ok(list_folders(connection)?
        .into_iter()
        .find(|folder| folder.id == id))
}

pub fn count_folders(connection: &Connection) -> AppResult<usize> {
    let count: i64 =
        connection.query_row("SELECT COUNT(*) FROM note_folders", [], |row| row.get(0))?;
    Ok(count as usize)
}

pub fn insert_folder(connection: &Connection, name: &str) -> AppResult<i64> {
    ensure_unique_folder_name(connection, name, None)?;
    connection.execute("INSERT INTO note_folders (name) VALUES (?1)", [name])?;
    Ok(connection.last_insert_rowid())
}

pub fn rename_folder(connection: &Connection, id: i64, name: &str) -> AppResult<()> {
    ensure_unique_folder_name(connection, name, Some(id))?;
    let changed = connection.execute(
        "UPDATE note_folders
         SET name = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        params![id, name],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(FOLDER_NOT_FOUND));
    }
    Ok(())
}

/// Exclui a pasta; as notas ficam sem pasta (`ON DELETE SET NULL`).
pub fn delete_folder(connection: &Connection, id: i64) -> AppResult<NoteFolder> {
    let folder = find_folder(connection, id)?.ok_or(AppError::NotFound(FOLDER_NOT_FOUND))?;
    connection.execute("DELETE FROM note_folders WHERE id = ?1", [id])?;
    Ok(folder)
}

/// Nomes únicos sem diferenciar maiúsculas (inclusive acentuadas).
fn ensure_unique_folder_name(
    connection: &Connection,
    name: &str,
    except_id: Option<i64>,
) -> AppResult<()> {
    let wanted = name.to_lowercase();
    let clash = list_folders(connection)?
        .into_iter()
        .any(|folder| Some(folder.id) != except_id && folder.name.to_lowercase() == wanted);
    if clash {
        return Err(AppError::Validation(format!(
            "já existe uma pasta chamada “{name}”"
        )));
    }
    Ok(())
}

fn ensure_folder_exists(connection: &Connection, folder_id: Option<i64>) -> AppResult<()> {
    let Some(folder_id) = folder_id else {
        return Ok(());
    };
    let exists: bool = connection.query_row(
        "SELECT EXISTS (SELECT 1 FROM note_folders WHERE id = ?1)",
        [folder_id],
        |row| row.get(0),
    )?;
    if exists {
        Ok(())
    } else {
        Err(AppError::Validation(FOLDER_NOT_FOUND.into()))
    }
}

// ---- Tags ------------------------------------------------------------------

fn replace_tags(connection: &Connection, note_id: i64, tags: &[String]) -> AppResult<()> {
    connection.execute("DELETE FROM note_tags WHERE note_id = ?1", [note_id])?;
    for name in tags {
        connection.execute(
            "INSERT INTO tags (name) VALUES (?1) ON CONFLICT (name) DO NOTHING",
            [name],
        )?;
        connection.execute(
            "INSERT INTO note_tags (note_id, tag_id)
             SELECT ?1, id FROM tags WHERE name = ?2",
            params![note_id, name],
        )?;
    }
    Ok(())
}

fn tags_of(connection: &Connection, note_id: i64) -> AppResult<Vec<String>> {
    let mut statement = connection.prepare(
        "SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
         WHERE nt.note_id = ?1 ORDER BY t.name",
    )?;
    let tags = statement
        .query_map([note_id], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    Ok(tags)
}

fn tags_by_note(connection: &Connection) -> AppResult<HashMap<i64, Vec<String>>> {
    let mut statement = connection.prepare(
        "SELECT nt.note_id, t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
         ORDER BY t.name",
    )?;
    let mut map: HashMap<i64, Vec<String>> = HashMap::new();
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (note_id, name) = row?;
        map.entry(note_id).or_default().push(name);
    }
    Ok(map)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn valid(title: &str) -> ValidNote {
        ValidNote {
            title: title.into(),
            content: "texto".into(),
            folder_id: None,
            tags: Vec::new(),
            journal_date: None,
        }
    }

    fn with_db(test: impl FnOnce(&Connection) -> AppResult<()>) {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| test(connection)).unwrap();
    }

    #[test]
    fn inserts_updates_and_lists_with_tags() {
        with_db(|connection| {
            let mut note = valid("Ideias");
            note.tags = vec!["projetos".into(), "casa".into()];
            let id = insert(connection, &note)?;

            let stored = find(connection, id)?.unwrap();
            assert_eq!(stored.tags, vec!["casa", "projetos"]);
            assert!(!stored.favorite);

            note.title = "Ideias soltas".into();
            note.tags = vec!["projetos".into()];
            update(connection, id, &note)?;
            set_favorite(connection, id, true)?;

            let listed = list(connection)?;
            assert_eq!(listed[0].title, "Ideias soltas");
            assert_eq!(listed[0].tags, vec!["projetos"]);
            assert!(listed[0].favorite);
            assert!(matches!(
                update(connection, 999, &note),
                Err(AppError::NotFound(_))
            ));
            Ok(())
        });
    }

    #[test]
    fn allows_one_journal_entry_per_day() {
        with_db(|connection| {
            let mut journal = valid("");
            journal.journal_date = Some("2026-09-25".into());
            insert(connection, &journal)?;
            assert!(matches!(
                insert(connection, &journal),
                Err(AppError::Validation(_))
            ));
            Ok(())
        });
    }

    #[test]
    fn keeps_only_the_newest_versions() {
        with_db(|connection| {
            let id = insert(connection, &valid("Nota"))?;
            assert!(version_due(connection, id)?);

            for index in 0..MAX_VERSIONS_PER_NOTE + 5 {
                insert_version(connection, id, "Nota", &format!("v{index}"))?;
            }
            let versions = list_versions(connection, id)?;
            assert_eq!(versions.len(), MAX_VERSIONS_PER_NOTE);
            assert_eq!(
                versions[0].content,
                format!("v{}", MAX_VERSIONS_PER_NOTE + 4)
            );
            // Acabou de gravar: a próxima versão automática ainda não é devida.
            assert!(!version_due(connection, id)?);

            delete(connection, id)?;
            let orphans: i64 =
                connection.query_row("SELECT COUNT(*) FROM note_versions", [], |row| row.get(0))?;
            assert_eq!(orphans, 0);
            Ok(())
        });
    }

    #[test]
    fn folders_are_unique_and_detach_notes_on_delete() {
        with_db(|connection| {
            let folder = insert_folder(connection, "Estudos")?;
            assert!(matches!(
                insert_folder(connection, "estudos"),
                Err(AppError::Validation(_))
            ));
            rename_folder(connection, folder, "ESTUDOS")?;

            let mut note = valid("Rust");
            note.folder_id = Some(folder);
            let id = insert(connection, &note)?;
            assert_eq!(list_folders(connection)?[0].note_count, 1);

            let deleted = delete_folder(connection, folder)?;
            assert_eq!((deleted.name.as_str(), deleted.note_count), ("ESTUDOS", 1));
            assert_eq!(find(connection, id)?.unwrap().folder_id, None);

            note.folder_id = Some(folder);
            assert!(matches!(
                insert(connection, &note),
                Err(AppError::Validation(_))
            ));
            Ok(())
        });
    }
}
