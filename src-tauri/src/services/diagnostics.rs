//! Casos de uso do diagnóstico: análise (somente leitura) e limites (auditados).

use serde::Serialize;

use crate::db::Database;
use crate::domain::diagnostics::{
    diagnose, DiagnosticInput, DiagnosticReport, DiagnosticThresholds, THRESHOLDS_SETTING_KEY,
};
use crate::error::AppResult;
use crate::platform::system_monitor::{system_drive, SystemMonitor};
use crate::repositories::settings;
use crate::services::settings::save_setting;

/// Limites em uso e os padrões (para "Restaurar padrões" na tela).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticSettings {
    pub thresholds: DiagnosticThresholds,
    pub defaults: DiagnosticThresholds,
}

fn load_thresholds(db: &Database) -> AppResult<DiagnosticThresholds> {
    let stored =
        db.with_connection(|connection| settings::find(connection, THRESHOLDS_SETTING_KEY))?;
    Ok(DiagnosticThresholds::from_stored(
        stored.as_ref().map(|entry| &entry.value),
    ))
}

pub fn get_thresholds(db: &Database) -> AppResult<DiagnosticSettings> {
    Ok(DiagnosticSettings {
        thresholds: load_thresholds(db)?,
        defaults: DiagnosticThresholds::default(),
    })
}

/// Valida e grava os limites; a gravação (ou falha) é auditada como alteração
/// de configuração.
pub fn set_thresholds(
    db: &Database,
    thresholds: &DiagnosticThresholds,
) -> AppResult<DiagnosticSettings> {
    thresholds.validate()?;
    save_setting(
        db,
        THRESHOLDS_SETTING_KEY,
        &serde_json::to_value(thresholds)?,
    )?;
    get_thresholds(db)
}

/// Analisa a leitura atual do sistema com os limites configurados. Não grava nada.
pub fn run_diagnostics(db: &Database, monitor: &SystemMonitor) -> AppResult<DiagnosticReport> {
    let thresholds = load_thresholds(db)?;
    let snapshot = monitor.snapshot()?;
    let processes = monitor.measured_processes()?;
    let drive = system_drive();
    Ok(diagnose(
        &DiagnosticInput {
            disks: &snapshot.disks,
            memory: &snapshot.memory,
            processes: &processes,
            system_drive: drive.as_deref(),
        },
        &thresholds,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppError;
    use crate::repositories::audit;
    use crate::services::settings::update_setting;

    fn audit_log(db: &Database) -> Vec<audit::AuditEntry> {
        db.with_connection(|connection| audit::list_recent(connection, 10))
            .unwrap()
    }

    #[test]
    fn defaults_when_nothing_is_saved() {
        let db = Database::open_in_memory().unwrap();
        let current = get_thresholds(&db).unwrap();
        assert_eq!(current.thresholds, DiagnosticThresholds::default());
        assert_eq!(current.defaults, DiagnosticThresholds::default());
    }

    #[test]
    fn saves_valid_thresholds_with_audit() {
        let db = Database::open_in_memory().unwrap();
        let wanted = DiagnosticThresholds {
            disk_attention_percent: 70,
            ..DiagnosticThresholds::default()
        };

        let saved = set_thresholds(&db, &wanted).unwrap();
        assert_eq!(saved.thresholds, wanted);
        assert_eq!(get_thresholds(&db).unwrap().thresholds, wanted);

        let log = audit_log(&db);
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].target.as_deref(), Some(THRESHOLDS_SETTING_KEY));
    }

    #[test]
    fn rejects_invalid_thresholds_without_side_effects() {
        let db = Database::open_in_memory().unwrap();
        let invalid = DiagnosticThresholds {
            memory_attention_percent: 95,
            ..DiagnosticThresholds::default()
        };

        assert!(matches!(
            set_thresholds(&db, &invalid),
            Err(AppError::Validation(_))
        ));
        assert_eq!(
            get_thresholds(&db).unwrap().thresholds,
            DiagnosticThresholds::default()
        );
        assert!(audit_log(&db).is_empty());
    }

    #[test]
    fn out_of_range_values_get_a_readable_message() {
        let db = Database::open_in_memory().unwrap();
        let invalid = DiagnosticThresholds {
            program_memory_percent: 2_540,
            ..DiagnosticThresholds::default()
        };
        let Err(AppError::Validation(message)) = set_thresholds(&db, &invalid) else {
            panic!("esperava erro de validação");
        };
        assert_eq!(message, "Programa (memória): use um valor de 1 a 100%.");
    }

    #[test]
    fn generic_setting_command_cannot_bypass_validation() {
        let db = Database::open_in_memory().unwrap();
        let result = update_setting(
            &db,
            THRESHOLDS_SETTING_KEY,
            &serde_json::json!({ "diskAttentionPercent": 0 }),
        );
        assert!(matches!(result, Err(AppError::Validation(_))));
        assert!(audit_log(&db).is_empty());
    }

    #[test]
    fn analyzes_the_current_machine() {
        let db = Database::open_in_memory().unwrap();
        let monitor = SystemMonitor::new();
        let report = run_diagnostics(&db, &monitor).unwrap();
        assert!(report.cpu_measured);
        assert!(report.checked_programs > 0);
        assert_eq!(report.thresholds, DiagnosticThresholds::default());
    }
}
