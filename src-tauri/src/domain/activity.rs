//! Atividades recentes do dashboard: o que aconteceu nos módulos, do mais
//! recente para o mais antigo. Somente leitura, montado a partir dos dados que
//! cada módulo já guarda (nada é gravado para isto). Os textos ficam no
//! frontend (`src/features/activity/domain/activity.ts`).

use serde::Serialize;
use serde_json::Value;

pub const ACTIVITY_MAX: u32 = 50;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ActivityDetail {
    #[serde(rename_all = "camelCase")]
    TaskCompleted { task_id: i64, title: String },
    /// Hábito marcado como feito em `date` (pode ser um dia anterior).
    #[serde(rename_all = "camelCase")]
    HabitDone {
        habit: String,
        routine: String,
        date: String,
    },
    /// Lançamento criado no app (os importados aparecem na importação).
    #[serde(rename_all = "camelCase")]
    TransactionCreated {
        description: String,
        transaction_kind: String,
        amount: i64,
    },
    #[serde(rename_all = "camelCase")]
    CleanupRun { cancelled: bool, removed_bytes: u64 },
    #[serde(rename_all = "camelCase")]
    StatementImported { file_name: String, added: u64 },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEntry {
    /// Único no feed (ex.: "task:12").
    pub id: String,
    /// ISO 8601 em UTC, como gravado no banco.
    pub occurred_at: String,
    #[serde(flatten)]
    pub detail: ActivityDetail,
}

/// Junta as fontes: mais recentes primeiro, até `limit`.
pub fn merge(sources: Vec<Vec<ActivityEntry>>, limit: usize) -> Vec<ActivityEntry> {
    let mut entries: Vec<ActivityEntry> = sources.into_iter().flatten().collect();
    entries.sort_by(|a, b| {
        b.occurred_at
            .cmp(&a.occurred_at)
            .then_with(|| b.id.cmp(&a.id))
    });
    entries.truncate(limit);
    entries
}

/// Limpeza concluída ou cancelada, pelo registro de auditoria (falhas não
/// removeram nada e ficam de fora).
pub fn cleanup_activity(
    id: i64,
    occurred_at: &str,
    outcome: &str,
    details: Option<&Value>,
) -> Option<ActivityEntry> {
    let cancelled = match outcome {
        "success" => false,
        "cancelled" => true,
        _ => return None,
    };
    let removed_bytes = details?.get("removedBytes")?.as_u64()?;
    Some(ActivityEntry {
        id: format!("audit:{id}"),
        occurred_at: occurred_at.to_owned(),
        detail: ActivityDetail::CleanupRun {
            cancelled,
            removed_bytes,
        },
    })
}

/// Importação de extrato concluída, pelo registro de auditoria.
pub fn import_activity(
    id: i64,
    occurred_at: &str,
    outcome: &str,
    details: Option<&Value>,
) -> Option<ActivityEntry> {
    if outcome != "success" {
        return None;
    }
    let details = details?;
    Some(ActivityEntry {
        id: format!("audit:{id}"),
        occurred_at: occurred_at.to_owned(),
        detail: ActivityDetail::StatementImported {
            file_name: details.get("fileName")?.as_str()?.to_owned(),
            added: details.get("added")?.as_u64()?,
        },
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn task(id: i64, at: &str) -> ActivityEntry {
        ActivityEntry {
            id: format!("task:{id}"),
            occurred_at: at.into(),
            detail: ActivityDetail::TaskCompleted {
                task_id: id,
                title: format!("Tarefa {id}"),
            },
        }
    }

    #[test]
    fn merges_the_sources_newest_first() {
        let merged = merge(
            vec![
                vec![
                    task(1, "2026-09-25T08:45:00.000Z"),
                    task(2, "2026-09-20T10:00:00.000Z"),
                ],
                vec![task(3, "2026-09-24T19:20:00.000Z")],
            ],
            2,
        );
        let ids: Vec<&str> = merged.iter().map(|entry| entry.id.as_str()).collect();
        assert_eq!(ids, ["task:1", "task:3"]);
    }

    #[test]
    fn reads_cleanups_and_imports_from_the_audit_log() {
        let details = json!({ "removedBytes": 1024, "removedCount": 3 });
        let run =
            cleanup_activity(7, "2026-09-24T14:05:00.000Z", "cancelled", Some(&details)).unwrap();
        assert_eq!(
            run.detail,
            ActivityDetail::CleanupRun {
                cancelled: true,
                removed_bytes: 1024
            }
        );
        assert!(cleanup_activity(8, "x", "failure", Some(&details)).is_none());
        assert!(cleanup_activity(9, "x", "success", Some(&json!({}))).is_none());

        let import = json!({ "fileName": "extrato.ofx", "added": 42 });
        assert_eq!(
            import_activity(10, "x", "success", Some(&import))
                .unwrap()
                .detail,
            ActivityDetail::StatementImported {
                file_name: "extrato.ofx".into(),
                added: 42
            }
        );
        assert!(import_activity(11, "x", "failure", Some(&import)).is_none());
    }

    #[test]
    fn serializes_flat_with_the_kind() {
        let value = serde_json::to_value(task(4, "2026-09-25T08:45:00.000Z")).unwrap();
        assert_eq!(
            value,
            json!({
                "id": "task:4",
                "occurredAt": "2026-09-25T08:45:00.000Z",
                "kind": "taskCompleted",
                "taskId": 4,
                "title": "Tarefa 4"
            })
        );
    }
}
