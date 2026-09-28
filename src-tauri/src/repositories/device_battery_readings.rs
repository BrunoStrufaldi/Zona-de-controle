//! Acesso à tabela `device_battery_readings` (última leitura de cada modelo).

use rusqlite::{params, Connection};

use crate::domain::devices::readers::{ModelReading, ReportedPower, ReportedStatus};
use crate::domain::devices::ModelReadings;
use crate::error::{AppError, AppResult};

/// Leituras gravadas por chave `vid:pid`, já marcadas como registro antigo.
pub fn list(connection: &Connection) -> AppResult<ModelReadings> {
    let mut statement = connection.prepare(
        "SELECT device_key, power, percent, last_percent, read_at_unix
         FROM device_battery_readings",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, u8>(2)?,
                row.get::<_, Option<u8>>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    rows.into_iter()
        .map(|(key, power, percent, last_percent, read_at_unix)| {
            let power = ReportedPower::parse(&power).ok_or_else(|| {
                AppError::Validation(format!("estado de bateria inválido: {power}"))
            })?;
            let reading = ModelReading {
                status: ReportedStatus { percent, power },
                read_at_unix,
                last_percent,
                from_saved: true,
            };
            Ok((key, reading))
        })
        .collect()
}

pub fn upsert(connection: &Connection, key: &str, reading: &ModelReading) -> AppResult<()> {
    connection.execute(
        "INSERT INTO device_battery_readings
             (device_key, power, percent, last_percent, read_at_unix)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (device_key) DO UPDATE
             SET power = excluded.power,
                 percent = excluded.percent,
                 last_percent = excluded.last_percent,
                 read_at_unix = excluded.read_at_unix",
        params![
            key,
            reading.status.power.as_str(),
            reading.status.percent,
            reading.last_percent,
            reading.read_at_unix
        ],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    #[test]
    fn saves_and_loads_the_last_reading_as_an_old_record() {
        let db = Database::open_in_memory().unwrap();
        db.with_connection(|connection| {
            let on = ModelReading::next(
                None,
                ReportedStatus {
                    percent: 80,
                    power: ReportedPower::OnBattery,
                },
                1_790_596_800,
            );
            upsert(connection, "291d:385d", &on)?;
            let off = ModelReading::next(
                Some(&on),
                ReportedStatus {
                    percent: 0,
                    power: ReportedPower::Off,
                },
                1_790_596_900,
            );
            upsert(connection, "291d:385d", &off)?;

            let saved = list(connection)?;
            assert_eq!(saved.len(), 1);
            let reading = saved["291d:385d"];
            assert_eq!(reading.status.power, ReportedPower::Off);
            assert_eq!(reading.last_percent, Some(80));
            assert_eq!(reading.read_at_unix, 1_790_596_900);
            // Ao carregar, é registro antigo (não é o nível atual).
            assert!(reading.from_saved);
            assert_eq!(reading, off.as_saved());
            Ok(())
        })
        .unwrap();
    }
}
