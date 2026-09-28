//! Acesso à tabela `device_markings`.

use std::collections::HashMap;

use rusqlite::{params, Connection};

use crate::domain::devices::{DeviceKind, DeviceMarking};
use crate::error::{AppError, AppResult};

/// Marcações por chave `vid:pid`.
pub fn list(connection: &Connection) -> AppResult<HashMap<String, DeviceMarking>> {
    let mut statement =
        connection.prepare("SELECT device_key, wireless, kind FROM device_markings")?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, bool>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    rows.into_iter()
        .map(|(key, wireless, kind)| {
            let kind = DeviceKind::parse(&kind).ok_or_else(|| {
                AppError::Validation(format!("tipo de dispositivo inválido: {kind}"))
            })?;
            Ok((key, DeviceMarking { wireless, kind }))
        })
        .collect()
}

pub fn upsert(connection: &Connection, key: &str, marking: &DeviceMarking) -> AppResult<()> {
    connection.execute(
        "INSERT INTO device_markings (device_key, wireless, kind) VALUES (?1, ?2, ?3)
         ON CONFLICT (device_key) DO UPDATE
             SET wireless = excluded.wireless,
                 kind = excluded.kind,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        params![key, marking.wireless, marking.kind.as_str()],
    )?;
    Ok(())
}

/// Volta ao padrão (sem marcação). Não é erro se não havia marcação.
pub fn delete(connection: &Connection, key: &str) -> AppResult<()> {
    connection.execute("DELETE FROM device_markings WHERE device_key = ?1", [key])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    #[test]
    fn upserts_lists_and_deletes() {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| {
            let marking = DeviceMarking {
                wireless: true,
                kind: DeviceKind::Keyboard,
            };
            upsert(connection, "3151:502d", &marking)?;
            upsert(
                connection,
                "3151:502d",
                &DeviceMarking {
                    kind: DeviceKind::Mouse,
                    ..marking
                },
            )?;
            let all = list(connection)?;
            assert_eq!(all.len(), 1);
            assert_eq!(all["3151:502d"].kind, DeviceKind::Mouse);

            delete(connection, "3151:502d")?;
            delete(connection, "3151:502d")?;
            assert!(list(connection)?.is_empty());
            Ok(())
        })
        .unwrap();
    }
}
