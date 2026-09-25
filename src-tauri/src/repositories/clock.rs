//! Data local ("hoje") segundo o fuso do sistema operacional, via SQLite.

use rusqlite::Connection;

use crate::domain::calendar::CalendarDate;
use crate::error::{AppError, AppResult};

/// Data local de hoje.
pub fn local_today(connection: &Connection) -> AppResult<CalendarDate> {
    let today: String =
        connection.query_row("SELECT date('now', 'localtime')", [], |row| row.get(0))?;
    CalendarDate::parse(&today)
        .ok_or_else(|| AppError::Validation(format!("data local inválida: {today}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    #[test]
    fn reads_the_local_date() {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| local_today(connection))
            .unwrap();
    }
}
