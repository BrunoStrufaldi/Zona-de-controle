//! Acesso à tabela `system_tweaks` (ajustes reversíveis do Windows, 4.6).

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::domain::system_tweaks::{TweakKind, TweakRecord, TweakTarget, TweakValue};
use crate::error::{AppError, AppResult};

/// `undoable`: o mais recente do mesmo `target` e ainda não desfeito.
const SELECT: &str = "
    SELECT id, kind, target, label, previous_value, applied_value, applied_at, undone_at,
           undone_at IS NULL AND id = (
               SELECT MAX(other.id) FROM system_tweaks other WHERE other.target = system_tweaks.target
           )
    FROM system_tweaks";

type RawRow = (
    i64,
    String,
    String,
    String,
    String,
    String,
    String,
    Option<String>,
    bool,
);

fn read_row(row: &Row<'_>) -> rusqlite::Result<RawRow> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
        row.get(8)?,
    ))
}

fn into_record(raw: RawRow) -> AppResult<TweakRecord> {
    let (id, kind, target, label, previous, applied, applied_at, undone_at, undoable) = raw;
    let kind = TweakKind::parse(&kind)
        .ok_or_else(|| AppError::Validation(format!("tipo de ajuste inválido: {kind}")))?;
    Ok(TweakRecord {
        id,
        kind,
        target,
        label,
        previous: serde_json::from_str(&previous)?,
        applied: serde_json::from_str(&applied)?,
        applied_at,
        undone_at,
        undoable,
    })
}

pub fn insert(
    connection: &Connection,
    target: &TweakTarget,
    label: &str,
    previous: &TweakValue,
    applied: &TweakValue,
) -> AppResult<i64> {
    connection.execute(
        "INSERT INTO system_tweaks (kind, target, label, previous_value, applied_value)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            target.kind().as_str(),
            target.key(),
            label,
            serde_json::to_string(previous)?,
            serde_json::to_string(applied)?,
        ],
    )?;
    Ok(connection.last_insert_rowid())
}

pub fn find(connection: &Connection, id: i64) -> AppResult<Option<TweakRecord>> {
    connection
        .query_row(&format!("{SELECT} WHERE id = ?1"), [id], read_row)
        .optional()?
        .map(into_record)
        .transpose()
}

/// Mais recentes primeiro.
pub fn list_recent(connection: &Connection, limit: u32) -> AppResult<Vec<TweakRecord>> {
    let mut statement = connection.prepare(&format!("{SELECT} ORDER BY id DESC LIMIT ?1"))?;
    let rows = statement
        .query_map([limit], read_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    rows.into_iter().map(into_record).collect()
}

/// Marca como desfeito (só se ainda não estava).
pub fn mark_undone(connection: &Connection, id: i64) -> AppResult<()> {
    let changed = connection.execute(
        "UPDATE system_tweaks SET undone_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1 AND undone_at IS NULL",
        [id],
    )?;
    if changed == 0 {
        return Err(AppError::Validation("Este ajuste já foi desfeito.".into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn game(value: Option<u32>) -> TweakValue {
        TweakValue::GameMode { value }
    }

    #[test]
    fn only_the_latest_of_each_target_is_undoable() {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| {
            let first = insert(
                connection,
                &TweakTarget::GameMode,
                "Modo de Jogo",
                &game(Some(0)),
                &game(Some(1)),
            )?;
            let plan = insert(
                connection,
                &TweakTarget::ActivePowerPlan,
                "Plano de energia",
                &TweakValue::PowerPlan {
                    guid: "a".into(),
                    name: "A".into(),
                },
                &TweakValue::PowerPlan {
                    guid: "b".into(),
                    name: "B".into(),
                },
            )?;
            let second = insert(
                connection,
                &TweakTarget::GameMode,
                "Modo de Jogo",
                &game(Some(0)),
                &game(Some(1)),
            )?;

            let all = list_recent(connection, 10)?;
            assert_eq!(
                all.iter().map(|record| record.id).collect::<Vec<_>>(),
                [second, plan, first]
            );
            assert!(!find(connection, first)?.unwrap().undoable);
            assert!(find(connection, second)?.unwrap().undoable);
            assert_eq!(
                find(connection, plan)?.unwrap().previous,
                TweakValue::PowerPlan {
                    guid: "a".into(),
                    name: "A".into()
                }
            );

            mark_undone(connection, second)?;
            let undone = find(connection, second)?.unwrap();
            assert!(undone.undone_at.is_some());
            assert!(!undone.undoable);
            assert!(mark_undone(connection, second).is_err());
            assert!(find(connection, 999)?.is_none());
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn rejects_invalid_rows() {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| {
            let invalid_json = connection.execute(
                "INSERT INTO system_tweaks (kind, target, label, previous_value, applied_value)
                 VALUES ('game_mode', 'gameMode', 'x', 'não é json', '{}')",
                [],
            );
            assert!(invalid_json.is_err());
            let invalid_kind = connection.execute(
                "INSERT INTO system_tweaks (kind, target, label, previous_value, applied_value)
                 VALUES ('outro', 'gameMode', 'x', '{}', '{}')",
                [],
            );
            assert!(invalid_kind.is_err());
            Ok(())
        })
        .unwrap();
    }
}
