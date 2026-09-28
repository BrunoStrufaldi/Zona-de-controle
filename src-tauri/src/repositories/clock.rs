//! Data e hora locais segundo o fuso do sistema operacional, via SQLite.

use rusqlite::Connection;

use crate::domain::calendar::{CalendarDate, LocalDateTime};
use crate::error::{AppError, AppResult};

/// Data local de hoje.
pub fn local_today(connection: &Connection) -> AppResult<CalendarDate> {
    let today: String =
        connection.query_row("SELECT date('now', 'localtime')", [], |row| row.get(0))?;
    CalendarDate::parse(&today)
        .ok_or_else(|| AppError::Validation(format!("data local inválida: {today}")))
}

/// Instante local atual, com precisão de minutos.
pub fn local_now(connection: &Connection) -> AppResult<LocalDateTime> {
    let now: String = connection.query_row(
        "SELECT strftime('%Y-%m-%dT%H:%M', 'now', 'localtime')",
        [],
        |row| row.get(0),
    )?;
    LocalDateTime::parse(&now)
        .ok_or_else(|| AppError::Validation(format!("horário local inválido: {now}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    #[test]
    fn reads_the_local_date() {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| {
            let today = local_today(connection)?;
            let now = local_now(connection)?;
            // Tolera a virada do dia entre as duas leituras.
            assert!(now.date == today || now.date == today.add_days(1));
            Ok(())
        })
        .unwrap();
    }
}
