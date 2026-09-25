//! Casos de uso de configurações: validação + persistência + auditoria.

use rusqlite::Connection;
use serde_json::{json, Value};

use crate::db::Database;
use crate::domain::audit::{AuditCategory, AuditOutcome, NewAuditEntry};
use crate::domain::settings::{validate_key, validate_serialized_value};
use crate::error::AppResult;
use crate::repositories::{audit, settings, settings::SettingEntry};

const ACTION_UPDATED: &str = "setting.updated";

pub fn list_settings(db: &Database) -> AppResult<Vec<SettingEntry>> {
    db.with_connection(|connection| settings::list(connection))
}

pub fn get_setting(db: &Database, key: &str) -> AppResult<Option<SettingEntry>> {
    validate_key(key)?;
    db.with_connection(|connection| settings::find(connection, key))
}

/// Salva a configuração e registra a alteração no log de auditoria na mesma
/// transação. Falhas de escrita também são auditadas.
pub fn update_setting(db: &Database, key: &str, value: &Value) -> AppResult<SettingEntry> {
    validate_key(key)?;
    let serialized = serde_json::to_string(value)?;
    validate_serialized_value(&serialized)?;

    db.with_connection(|connection| {
        let result = upsert_with_audit(connection, key, &serialized);

        if let Err(error) = &result {
            let details = json!({ "error": error.to_string() });
            // Melhor esforço: a falha original é o erro relevante para o chamador.
            let _ = audit::record(
                connection,
                &audit_entry(key, AuditOutcome::Failure, Some(details)),
            );
        }
        result
    })
}

fn upsert_with_audit(
    connection: &mut Connection,
    key: &str,
    serialized: &str,
) -> AppResult<SettingEntry> {
    let transaction = connection.transaction()?;
    let entry = settings::upsert(&transaction, key, serialized)?;
    audit::record(&transaction, &audit_entry(key, AuditOutcome::Success, None))?;
    transaction.commit()?;
    Ok(entry)
}

fn audit_entry(key: &str, outcome: AuditOutcome, details: Option<Value>) -> NewAuditEntry<'_> {
    NewAuditEntry {
        category: AuditCategory::Settings,
        action: ACTION_UPDATED,
        target: Some(key),
        outcome,
        details,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppError;

    #[test]
    fn update_persists_value_and_writes_audit_entry() {
        let db = Database::open_in_memory().unwrap();

        let entry = update_setting(&db, "profile.display_name", &json!("Ana")).unwrap();
        assert_eq!(entry.value, json!("Ana"));

        let log = db
            .with_connection(|connection| audit::list_recent(connection, 10))
            .unwrap();
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].action, ACTION_UPDATED);
        assert_eq!(log[0].target.as_deref(), Some("profile.display_name"));
        assert_eq!(log[0].outcome, "success");
    }

    #[test]
    fn invalid_key_is_rejected_without_side_effects() {
        let db = Database::open_in_memory().unwrap();

        let result = update_setting(&db, "Invalid Key", &json!(1));
        assert!(matches!(result, Err(AppError::Validation(_))));

        let log = db
            .with_connection(|connection| audit::list_recent(connection, 10))
            .unwrap();
        assert!(log.is_empty());
        assert!(list_settings(&db).unwrap().is_empty());
    }
}
