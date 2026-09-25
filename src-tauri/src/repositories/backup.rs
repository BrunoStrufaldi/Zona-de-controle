//! SQL do backup: cópia consistente com `VACUUM INTO` e verificação de integridade.

use std::path::Path;

use rusqlite::{Connection, OpenFlags};

use crate::error::{AppError, AppResult};

/// Data/hora local atual no formato `aaaa-mm-dd_hhmmss` (fuso do sistema).
pub fn local_timestamp(connection: &Connection) -> AppResult<String> {
    let timestamp = connection.query_row(
        "SELECT strftime('%Y-%m-%d_%H%M%S', 'now', 'localtime')",
        [],
        |row| row.get(0),
    )?;
    Ok(timestamp)
}

/// Grava uma cópia compacta e consistente do banco em `target` (que não pode
/// existir). Funciona com o app aberto e inclui o conteúdo ainda no WAL.
pub fn vacuum_into(connection: &Connection, target: &Path) -> AppResult<()> {
    let target = target
        .to_str()
        .ok_or_else(|| AppError::Validation("caminho de backup inválido".into()))?;
    connection.execute("VACUUM INTO ?1", [target])?;
    Ok(())
}

/// Abre a cópia somente leitura e roda `PRAGMA quick_check`.
pub fn verify(target: &Path) -> AppResult<()> {
    let copy = Connection::open_with_flags(target, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let result: String = copy.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
    if result == "ok" {
        Ok(())
    } else {
        Err(AppError::Validation(format!(
            "o backup não passou na verificação de integridade: {result}"
        )))
    }
}
