//! Casos de uso das configurações do Windows e do hardware (4.5): somente
//! leitura. Nada é gravado no banco nem alterado no sistema.

use crate::db::Database;
use crate::domain::system_settings::hardware::{self, HardwareReport};
use crate::domain::system_settings::{
    build_windows_report, SystemSettingsReader, WindowsSettingsReport,
};
use crate::error::AppResult;
use crate::repositories::clock::local_today;

/// Energia, Modo de Jogo, HAGS, reinício pendente e inicialização, com os achados.
pub fn windows_settings(reader: &impl SystemSettingsReader) -> WindowsSettingsReport {
    build_windows_report(reader.windows_settings())
}

/// Firmware, CPU e memória, com os achados (a idade da BIOS conta a partir de hoje).
pub fn hardware(db: &Database, reader: &impl SystemSettingsReader) -> AppResult<HardwareReport> {
    let today = db.with_connection(|connection| local_today(connection))?;
    Ok(hardware::build_report(reader.hardware(), today))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::calendar::CalendarDate;
    use crate::domain::system_settings::hardware::RawHardware;
    use crate::domain::system_settings::smbios::tests::{bios_structure, raw};
    use crate::domain::system_settings::RawWindowsSettings;

    struct FakeReader {
        bios_date: String,
    }

    impl SystemSettingsReader for FakeReader {
        fn windows_settings(&self) -> RawWindowsSettings {
            RawWindowsSettings::default()
        }

        fn hardware(&self) -> RawHardware {
            RawHardware {
                smbios: Some(raw(&[bios_structure("BIOS", "1", &self.bios_date)])),
                ..RawHardware::default()
            }
        }
    }

    #[test]
    fn bios_age_counts_from_the_local_date() {
        let db = Database::open_in_memory().unwrap();
        let today = db
            .with_connection(|connection| local_today(connection))
            .unwrap();
        let old = today.add_months(-13, today.day());
        let date = format!("{:02}/{:02}/{}", old.month(), old.day(), old.year());
        let reader = FakeReader { bios_date: date };
        let report = hardware(&db, &reader).unwrap();
        assert_eq!(report.findings.len(), 1);

        let recent = FakeReader {
            bios_date: "01/01/2999".into(),
        };
        assert!(hardware(&db, &recent).unwrap().findings.is_empty());
        assert!(CalendarDate::parse("2999-01-01").is_some());
    }

    #[test]
    fn unreadable_windows_settings_have_no_findings() {
        let report = windows_settings(&FakeReader {
            bios_date: String::new(),
        });
        assert!(report.findings.is_empty());
        assert_eq!(report.power, None);
    }
}
