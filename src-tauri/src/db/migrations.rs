//! Migrations versionadas, embutidas no binário a partir de `src-tauri/migrations/`.
//!
//! Para criar uma nova migration:
//! 1. Adicione `migrations/NNNN_descricao.sql` (NNNN = próxima versão).
//! 2. Registre-a em [`MIGRATIONS`] com a mesma versão.
//! 3. Nunca edite uma migration já publicada — crie uma nova.

use rusqlite::{params, Connection};

use crate::error::{AppError, AppResult};

pub struct Migration {
    pub version: u32,
    pub name: &'static str,
    sql: &'static str,
}

/// Lista ordenada de migrations. As versões devem ser consecutivas a partir de 1.
pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "initial",
        sql: include_str!("../../migrations/0001_initial.sql"),
    },
    Migration {
        version: 2,
        name: "tasks",
        sql: include_str!("../../migrations/0002_tasks.sql"),
    },
    Migration {
        version: 3,
        name: "tasks_extras",
        sql: include_str!("../../migrations/0003_tasks_extras.sql"),
    },
    Migration {
        version: 4,
        name: "notes",
        sql: include_str!("../../migrations/0004_notes.sql"),
    },
    Migration {
        version: 5,
        name: "routines",
        sql: include_str!("../../migrations/0005_routines.sql"),
    },
    Migration {
        version: 6,
        name: "calendar",
        sql: include_str!("../../migrations/0006_calendar.sql"),
    },
    Migration {
        version: 7,
        name: "device_markings",
        sql: include_str!("../../migrations/0007_device_markings.sql"),
    },
];

const CREATE_SCHEMA_MIGRATIONS: &str = "
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INTEGER PRIMARY KEY NOT NULL,
        name       TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ) STRICT;
";

/// Aplica as migrations pendentes, cada uma em sua própria transação.
/// Retorna a versão final do schema.
pub fn run(connection: &mut Connection) -> AppResult<u32> {
    connection.execute_batch(CREATE_SCHEMA_MIGRATIONS)?;

    let current = current_version(connection)?;
    let latest = latest_version();
    if current > latest {
        return Err(AppError::Validation(format!(
            "o banco de dados está na versão {current}, mais nova que a suportada ({latest}); \
             atualize o aplicativo"
        )));
    }

    for migration in MIGRATIONS.iter().filter(|m| m.version > current) {
        apply(connection, migration)?;
    }

    current_version(connection)
}

pub fn current_version(connection: &Connection) -> AppResult<u32> {
    let version = connection.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;
    Ok(version)
}

fn latest_version() -> u32 {
    MIGRATIONS.last().map_or(0, |migration| migration.version)
}

fn apply(connection: &mut Connection, migration: &Migration) -> AppResult<()> {
    let to_migration_error = |source| AppError::Migration {
        version: migration.version,
        source,
    };

    let transaction = connection.transaction()?;
    transaction
        .execute_batch(migration.sql)
        .map_err(to_migration_error)?;
    transaction
        .execute(
            "INSERT INTO schema_migrations (version, name) VALUES (?1, ?2)",
            params![migration.version, migration.name],
        )
        .map_err(to_migration_error)?;
    transaction.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table_exists(connection: &Connection, name: &str) -> bool {
        connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [name],
                |row| row.get::<_, i64>(0),
            )
            .unwrap()
            == 1
    }

    #[test]
    fn versions_are_consecutive_from_one() {
        for (index, migration) in MIGRATIONS.iter().enumerate() {
            assert_eq!(migration.version as usize, index + 1, "{}", migration.name);
        }
    }

    #[test]
    fn applies_all_migrations_on_a_fresh_database() {
        let mut connection = Connection::open_in_memory().unwrap();
        let version = run(&mut connection).unwrap();

        assert_eq!(version, latest_version());
        for table in [
            "app_settings",
            "audit_log",
            "tasks",
            "tags",
            "task_tags",
            "task_categories",
            "task_checklist_items",
            "notes",
            "note_tags",
            "note_versions",
            "note_folders",
            "routines",
            "habits",
            "habit_completions",
            "calendar_events",
            "calendar_event_exceptions",
            "calendar_reminders_sent",
            "device_markings",
        ] {
            assert!(table_exists(&connection, table), "{table}");
        }
    }

    #[test]
    fn upgrades_an_existing_database_preserving_data() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(CREATE_SCHEMA_MIGRATIONS).unwrap();
        apply(&mut connection, &MIGRATIONS[0]).unwrap();
        connection
            .execute(
                "INSERT INTO app_settings (key, value) VALUES ('profile.display_name', '\"Ana\"')",
                [],
            )
            .unwrap();

        let version = run(&mut connection).unwrap();

        assert_eq!(version, latest_version());
        let value: String = connection
            .query_row("SELECT value FROM app_settings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "\"Ana\"");
    }

    #[test]
    fn upgrades_tasks_from_version_2_keeping_rows() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(CREATE_SCHEMA_MIGRATIONS).unwrap();
        apply(&mut connection, &MIGRATIONS[0]).unwrap();
        apply(&mut connection, &MIGRATIONS[1]).unwrap();
        connection
            .execute(
                "INSERT INTO tasks (title, due_date) VALUES ('Antiga', '2026-09-25')",
                [],
            )
            .unwrap();

        run(&mut connection).unwrap();

        let (title, category, recurrence, archived): (
            String,
            Option<i64>,
            Option<String>,
            Option<String>,
        ) = connection
            .query_row(
                "SELECT title, category_id, recurrence, archived_at FROM tasks",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(title, "Antiga");
        assert_eq!((category, recurrence, archived), (None, None, None));
    }

    #[test]
    fn upgrades_from_version_5_keeping_routines() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(CREATE_SCHEMA_MIGRATIONS).unwrap();
        for migration in &MIGRATIONS[..5] {
            apply(&mut connection, migration).unwrap();
        }
        connection
            .execute(
                "INSERT INTO routines (name, weekdays, start_date) VALUES ('Manhã', 127, '2026-09-20')",
                [],
            )
            .unwrap();

        run(&mut connection).unwrap();

        let name: String = connection
            .query_row("SELECT name FROM routines", [], |row| row.get(0))
            .unwrap();
        assert_eq!(name, "Manhã");
        assert!(table_exists(&connection, "calendar_events"));
        // As restrições de horário recusam valores fora de HH:MM.
        let invalid = connection.execute(
            "INSERT INTO calendar_events (title, color, all_day, start_date, start_time,
                                          end_date, end_time)
             VALUES ('x', 'blue', 0, '2026-09-25', '25:00', '2026-09-25', '26:00')",
            [],
        );
        assert!(invalid.is_err());
    }

    #[test]
    fn upgrades_from_version_6_keeping_events() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(CREATE_SCHEMA_MIGRATIONS).unwrap();
        for migration in &MIGRATIONS[..6] {
            apply(&mut connection, migration).unwrap();
        }
        connection
            .execute(
                "INSERT INTO calendar_events (title, color, all_day, start_date, end_date)
                 VALUES ('Consulta', 'blue', 1, '2026-09-28', '2026-09-28')",
                [],
            )
            .unwrap();

        run(&mut connection).unwrap();

        let title: String = connection
            .query_row("SELECT title FROM calendar_events", [], |row| row.get(0))
            .unwrap();
        assert_eq!(title, "Consulta");
        // A chave precisa ser `vid:pid` em hexadecimal minúsculo.
        let insert = |key: &str| {
            connection.execute(
                "INSERT INTO device_markings (device_key, wireless, kind) VALUES (?1, 1, 'mouse')",
                [key],
            )
        };
        assert!(insert("24ae:1416").is_ok());
        assert!(insert("24AE:1417").is_err());
        assert!(insert("24ae-1418").is_err());
    }

    #[test]
    fn running_twice_is_idempotent() {
        let mut connection = Connection::open_in_memory().unwrap();
        run(&mut connection).unwrap();
        let version = run(&mut connection).unwrap();

        let applied: i64 = connection
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(version, latest_version());
        assert_eq!(applied as usize, MIGRATIONS.len());
    }

    #[test]
    fn rejects_database_from_a_newer_version() {
        let mut connection = Connection::open_in_memory().unwrap();
        run(&mut connection).unwrap();
        connection
            .execute(
                "INSERT INTO schema_migrations (version, name) VALUES (?1, 'future')",
                [latest_version() + 1],
            )
            .unwrap();

        assert!(matches!(run(&mut connection), Err(AppError::Validation(_))));
    }
}
