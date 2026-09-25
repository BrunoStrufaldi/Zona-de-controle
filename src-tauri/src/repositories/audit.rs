//! Acesso à tabela `audit_log` (somente inserção e leitura).

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::domain::audit::NewAuditEntry;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub id: i64,
    pub occurred_at: String,
    pub category: String,
    pub action: String,
    pub target: Option<String>,
    pub outcome: String,
    pub details: Option<serde_json::Value>,
}

pub fn record(connection: &Connection, entry: &NewAuditEntry<'_>) -> AppResult<()> {
    let details = entry
        .details
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;

    connection.execute(
        "INSERT INTO audit_log (category, action, target, outcome, details)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            entry.category.as_str(),
            entry.action,
            entry.target,
            entry.outcome.as_str(),
            details
        ],
    )?;
    Ok(())
}

/// Registros mais recentes primeiro.
pub fn list_recent(connection: &Connection, limit: u32) -> AppResult<Vec<AuditEntry>> {
    let mut statement = connection.prepare(
        "SELECT id, occurred_at, category, action, target, outcome, details
         FROM audit_log
         ORDER BY occurred_at DESC, id DESC
         LIMIT ?1",
    )?;

    let rows = statement.query_map([limit], |row| {
        Ok((
            AuditEntry {
                id: row.get(0)?,
                occurred_at: row.get(1)?,
                category: row.get(2)?,
                action: row.get(3)?,
                target: row.get(4)?,
                outcome: row.get(5)?,
                details: None,
            },
            row.get::<_, Option<String>>(6)?,
        ))
    })?;

    rows.map(|row| {
        let (mut entry, details) = row?;
        entry.details = details.as_deref().map(serde_json::from_str).transpose()?;
        Ok(entry)
    })
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::domain::audit::{AuditCategory, AuditOutcome};

    fn sample(action: &str) -> NewAuditEntry<'_> {
        NewAuditEntry {
            category: AuditCategory::Settings,
            action,
            target: Some("theme"),
            outcome: AuditOutcome::Success,
            details: Some(serde_json::json!({ "source": "test" })),
        }
    }

    #[test]
    fn records_and_lists_newest_first() {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| {
            record(connection, &sample("first"))?;
            record(connection, &sample("second"))?;

            let entries = list_recent(connection, 10)?;
            assert_eq!(entries.len(), 2);
            assert_eq!(entries[0].action, "second");
            assert_eq!(entries[0].outcome, "success");
            assert_eq!(list_recent(connection, 1)?.len(), 1);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn log_is_append_only() {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| {
            record(connection, &sample("first"))?;
            assert!(connection
                .execute("UPDATE audit_log SET action = 'x'", [])
                .is_err());
            assert!(connection.execute("DELETE FROM audit_log", []).is_err());
            Ok(())
        })
        .unwrap();
    }
}
