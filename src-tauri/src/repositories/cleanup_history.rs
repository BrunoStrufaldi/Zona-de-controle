//! Histórico das limpezas. A fonte é o `audit_log` (registros
//! `optimization` / `cleanup.executed`); não há tabela própria. A listagem usa
//! `audit::list_by_action`; aqui fica o total de todo o histórico.

use rusqlite::{params, Connection};

use crate::domain::audit::AuditCategory;
use crate::domain::optimization::CLEANUP_AUDIT_ACTION;
use crate::error::AppResult;

/// Limpezas feitas (concluídas ou canceladas no meio) e o espaço liberado por
/// elas. Falhas não entram: não removeram nada.
pub fn totals(connection: &Connection) -> AppResult<(u64, u64)> {
    let (runs, bytes): (i64, i64) = connection.query_row(
        "SELECT COUNT(*),
                COALESCE(SUM(CAST(json_extract(details, '$.removedBytes') AS INTEGER)), 0)
         FROM audit_log
         WHERE category = ?1 AND action = ?2 AND outcome IN ('success', 'cancelled')",
        params![AuditCategory::Optimization.as_str(), CLEANUP_AUDIT_ACTION],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    Ok((
        u64::try_from(runs).unwrap_or(0),
        u64::try_from(bytes).unwrap_or(0),
    ))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::db::Database;
    use crate::domain::audit::{AuditOutcome, NewAuditEntry};
    use crate::repositories::audit;

    fn record(
        connection: &Connection,
        category: AuditCategory,
        outcome: AuditOutcome,
        bytes: u64,
    ) -> AppResult<()> {
        audit::record(
            connection,
            &NewAuditEntry {
                category,
                action: CLEANUP_AUDIT_ACTION,
                target: None,
                outcome,
                details: Some(json!({ "removedBytes": bytes })),
            },
        )
    }

    #[test]
    fn sums_only_cleanups_that_ran() {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| {
            assert_eq!(totals(connection)?, (0, 0));
            record(
                connection,
                AuditCategory::Optimization,
                AuditOutcome::Success,
                100,
            )?;
            record(
                connection,
                AuditCategory::Optimization,
                AuditOutcome::Cancelled,
                20,
            )?;
            record(
                connection,
                AuditCategory::Optimization,
                AuditOutcome::Failure,
                999,
            )?;
            // Mesma ação em outra categoria não conta.
            record(
                connection,
                AuditCategory::Settings,
                AuditOutcome::Success,
                999,
            )?;
            assert_eq!(totals(connection)?, (2, 120));
            Ok(())
        })
        .unwrap();
    }
}
