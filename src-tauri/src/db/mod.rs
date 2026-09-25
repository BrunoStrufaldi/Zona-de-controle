//! Acesso ao SQLite. Toda query do app passa por aqui — o frontend nunca
//! executa SQL (ver CLAUDE.md → Persistência).

pub mod migrations;

use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use rusqlite::Connection;

use crate::error::{AppError, AppResult};

/// Nome do arquivo do banco dentro do diretório de dados do app.
pub const DATABASE_FILE_NAME: &str = "zona-de-controle.db";

/// Conexão única protegida por mutex. Suficiente para um app desktop de um
/// usuário; se necessário no futuro, pode ser trocada por um pool.
pub struct Database {
    connection: Mutex<Connection>,
    schema_version: u32,
}

impl Database {
    /// Abre (ou cria) o banco no caminho indicado e aplica as migrations pendentes.
    pub fn open(path: &Path) -> AppResult<Self> {
        Self::initialize(Connection::open(path)?)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> AppResult<Self> {
        Self::initialize(Connection::open_in_memory()?)
    }

    fn initialize(mut connection: Connection) -> AppResult<Self> {
        configure(&connection)?;
        let schema_version = migrations::run(&mut connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
            schema_version,
        })
    }

    pub fn schema_version(&self) -> u32 {
        self.schema_version
    }

    /// Executa `operation` com acesso exclusivo à conexão.
    pub fn with_connection<T>(
        &self,
        operation: impl FnOnce(&mut Connection) -> AppResult<T>,
    ) -> AppResult<T> {
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| AppError::StatePoisoned)?;
        operation(&mut connection)
    }
}

fn configure(connection: &Connection) -> AppResult<()> {
    connection.pragma_update(None, "foreign_keys", "ON")?;
    // WAL melhora a concorrência entre leituras e escritas.
    connection
        .pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get::<_, String>(0))?;
    connection.pragma_update(None, "synchronous", "NORMAL")?;
    connection.busy_timeout(Duration::from_secs(5))?;
    Ok(())
}
