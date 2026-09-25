//! Acesso à tabela `app_settings`.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

use crate::error::AppResult;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingEntry {
    pub key: String,
    pub value: serde_json::Value,
    pub updated_at: String,
}

const SELECT_COLUMNS: &str = "SELECT key, value, updated_at FROM app_settings";

fn map_row(row: &Row<'_>) -> rusqlite::Result<(String, String, String)> {
    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
}

fn into_entry((key, value, updated_at): (String, String, String)) -> AppResult<SettingEntry> {
    Ok(SettingEntry {
        key,
        value: serde_json::from_str(&value)?,
        updated_at,
    })
}

pub fn list(connection: &Connection) -> AppResult<Vec<SettingEntry>> {
    let mut statement = connection.prepare(&format!("{SELECT_COLUMNS} ORDER BY key"))?;
    let rows = statement.query_map([], map_row)?;
    rows.map(|row| into_entry(row?)).collect()
}

pub fn find(connection: &Connection, key: &str) -> AppResult<Option<SettingEntry>> {
    connection
        .query_row(&format!("{SELECT_COLUMNS} WHERE key = ?1"), [key], map_row)
        .optional()?
        .map(into_entry)
        .transpose()
}

/// Insere ou atualiza a configuração. `serialized_value` deve ser JSON válido.
pub fn upsert(
    connection: &Connection,
    key: &str,
    serialized_value: &str,
) -> AppResult<SettingEntry> {
    let row = connection.query_row(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE
             SET value = excluded.value,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         RETURNING key, value, updated_at",
        params![key, serialized_value],
        map_row,
    )?;
    into_entry(row)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use serde_json::json;

    #[test]
    fn upsert_inserts_then_updates() {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| {
            upsert(connection, "profile.display_name", "\"Ana\"")?;
            let updated = upsert(connection, "profile.display_name", "\"Bia\"")?;

            assert_eq!(updated.value, json!("Bia"));
            assert_eq!(list(connection)?.len(), 1);
            assert_eq!(
                find(connection, "profile.display_name")?.map(|entry| entry.value),
                Some(json!("Bia"))
            );
            assert!(find(connection, "missing")?.is_none());
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn database_rejects_invalid_json() {
        let db = Database::open_in_memory().unwrap();
        let result = db.with_connection(|connection| upsert(connection, "theme", "{invalid"));
        assert!(result.is_err());
    }
}
