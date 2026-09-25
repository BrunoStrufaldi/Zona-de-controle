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
pub const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    name: "initial",
    sql: include_str!("../../migrations/0001_initial.sql"),
}];

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
        assert!(table_exists(&connection, "app_settings"));
        assert!(table_exists(&connection, "audit_log"));
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
