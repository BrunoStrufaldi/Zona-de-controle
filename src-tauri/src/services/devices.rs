//! Casos de uso de dispositivos: leitura (somente leitura) e marcações (auditadas).

use rusqlite::Connection;
use serde_json::json;

use crate::db::Database;
use crate::domain::audit::{AuditCategory, AuditOutcome, NewAuditEntry};
use crate::domain::devices::{
    bluetooth_battery_devices, list_usb_input_devices, normalize_marking, parse_device_key,
    usb_battery_devices, xinput_battery_devices, DeviceBatteryInfo, DeviceMarking, ModelReadings,
    RawBluetoothBattery, RawHidCollection, RawXInputPad, UsbInputDevice,
};
use crate::error::AppResult;
use crate::platform::devices::DeviceReader;
use crate::repositories::{audit, clock, device_markings};

const ACTION_MARKED: &str = "device.marked";

/// Leituras brutas do SO, separadas da leitura em si para os testes.
pub struct DeviceReadings {
    pub hid: Vec<RawHidCollection>,
    pub pads: Vec<RawXInputPad>,
    pub bluetooth: Vec<RawBluetoothBattery>,
    /// Últimas leituras dos modelos com leitor (escuta em segundo plano).
    pub models: ModelReadings,
}

impl DeviceReadings {
    pub fn read(reader: &DeviceReader) -> AppResult<Self> {
        Ok(Self {
            hid: reader.hid_collections()?,
            pads: reader.xinput_pads(),
            bluetooth: reader.bluetooth_batteries(),
            models: reader.model_readings()?,
        })
    }
}

/// Mouses, teclados e headsets USB conectados, com a classificação aplicada.
pub fn list_usb_devices(db: &Database, hid: &[RawHidCollection]) -> AppResult<Vec<UsbInputDevice>> {
    let markings = db.with_connection(|connection| device_markings::list(connection))?;
    Ok(list_usb_input_devices(hid, &markings))
}

/// Receptores sem fio, controles Xbox e Bluetooth, com a bateria quando legível.
pub fn list_battery_devices(
    db: &Database,
    readings: &DeviceReadings,
) -> AppResult<Vec<DeviceBatteryInfo>> {
    let usb = list_usb_devices(db, &readings.hid)?;
    let (read_at, mut devices) = db.with_connection(|connection| {
        let read_at = clock::utc_now_iso(connection)?;
        let usb_devices = usb_battery_devices(&usb, &readings.models, |unix| {
            clock::unix_to_iso(connection, unix).ok()
        });
        Ok((read_at, usb_devices))
    })?;
    devices.extend(xinput_battery_devices(&readings.pads, &read_at));
    devices.extend(bluetooth_battery_devices(&readings.bluetooth, &read_at));
    Ok(devices)
}

/// Grava a escolha do usuário ("é sem fio", tipo). Igual ao padrão, a marcação
/// é apagada. Sucesso e falha vão para a auditoria, com o nome do dispositivo.
pub fn set_device_marking(
    db: &Database,
    hid: &[RawHidCollection],
    key: &str,
    marking: DeviceMarking,
) -> AppResult<Vec<UsbInputDevice>> {
    let (vendor_id, product_id) = parse_device_key(key)?;
    let normalized = normalize_marking(vendor_id, product_id, marking);
    let name = list_usb_devices(db, hid)?
        .into_iter()
        .find(|device| device.key == key)
        .map(|device| device.product_name);
    let details = json!({
        "name": name,
        "wireless": marking.wireless,
        "kind": marking.kind.as_str(),
    });

    db.with_connection(|connection| {
        let result = save_with_audit(connection, key, normalized.as_ref(), details.clone());
        if let Err(error) = &result {
            let mut failure = details.clone();
            failure["error"] = json!(error.to_string());
            // Melhor esforço: a falha original é o erro relevante para o chamador.
            let _ = audit::record(
                connection,
                &audit_entry(key, AuditOutcome::Failure, failure),
            );
        }
        result
    })?;
    list_usb_devices(db, hid)
}

fn save_with_audit(
    connection: &mut Connection,
    key: &str,
    marking: Option<&DeviceMarking>,
    details: serde_json::Value,
) -> AppResult<()> {
    let transaction = connection.transaction()?;
    match marking {
        Some(marking) => device_markings::upsert(&transaction, key, marking)?,
        None => device_markings::delete(&transaction, key)?,
    }
    audit::record(
        &transaction,
        &audit_entry(key, AuditOutcome::Success, details),
    )?;
    transaction.commit()?;
    Ok(())
}

fn audit_entry(key: &str, outcome: AuditOutcome, details: serde_json::Value) -> NewAuditEntry<'_> {
    NewAuditEntry {
        category: AuditCategory::Devices,
        action: ACTION_MARKED,
        target: Some(key),
        outcome,
        details: Some(details),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::devices::{BatteryLevel, DeviceKind, PadPower};
    use crate::error::AppError;

    fn collection(vid: u16, pid: u16, product: &str, usage: u16) -> RawHidCollection {
        RawHidCollection {
            vendor_id: vid,
            product_id: pid,
            product: product.into(),
            usage_page: 0x01,
            usage,
        }
    }

    fn hid() -> Vec<RawHidCollection> {
        vec![
            collection(0x24AE, 0x1416, "Rapoo Gaming Device", 0x02),
            collection(0x3151, 0x502D, "Akko Keyboard", 0x06),
        ]
    }

    fn audit_log(db: &Database) -> Vec<audit::AuditEntry> {
        db.with_connection(|connection| audit::list_recent(connection, 10))
            .unwrap()
    }

    #[test]
    fn lists_battery_devices_from_every_source() {
        let db = Database::open_in_memory().unwrap();
        let readings = DeviceReadings {
            hid: hid(),
            pads: vec![RawXInputPad {
                slot: 0,
                power: PadPower::Battery,
                level: 3,
            }],
            bluetooth: vec![RawBluetoothBattery {
                name: "Fone".into(),
                percent: 55,
            }],
            models: ModelReadings::new(),
        };

        let devices = list_battery_devices(&db, &readings).unwrap();
        let ids: Vec<_> = devices.iter().map(|d| d.id.as_str()).collect();
        assert_eq!(ids, ["usb:24ae:1416", "xinput:0", "bt:fone"]);
        assert_eq!(devices[2].level, BatteryLevel::Exact { percent: 55 });
        assert!(devices[1].last_updated.as_deref().unwrap().ends_with('Z'));
    }

    #[test]
    fn model_readings_carry_the_time_of_the_reading() {
        use crate::domain::devices::readers::{ModelReading, ReportedPower, ReportedStatus};

        let db = Database::open_in_memory().unwrap();
        let readings = DeviceReadings {
            hid: vec![RawHidCollection {
                vendor_id: 0x291D,
                product_id: 0x385D,
                product: "MCHOSE V9 PRO".into(),
                usage_page: 0x0B,
                usage: 0x05,
            }],
            pads: Vec::new(),
            bluetooth: Vec::new(),
            models: ModelReadings::from([(
                "291d:385d".to_string(),
                ModelReading {
                    status: ReportedStatus {
                        percent: 87,
                        power: ReportedPower::OnBattery,
                    },
                    // 2026-09-28T12:00:00Z
                    read_at_unix: 1_790_596_800,
                    last_percent: Some(87),
                },
            )]),
        };

        let devices = list_battery_devices(&db, &readings).unwrap();
        assert_eq!(devices[0].level, BatteryLevel::Exact { percent: 87 });
        assert_eq!(
            devices[0].last_updated.as_deref(),
            Some("2026-09-28T12:00:00Z")
        );
    }

    #[test]
    fn marking_a_wired_keyboard_as_wireless_is_saved_and_audited() {
        let db = Database::open_in_memory().unwrap();
        let marking = DeviceMarking {
            wireless: true,
            kind: DeviceKind::Keyboard,
        };

        let devices = set_device_marking(&db, &hid(), "3151:502d", marking).unwrap();
        let akko = devices.iter().find(|d| d.key == "3151:502d").unwrap();
        assert!(akko.wireless && akko.marked);

        let log = audit_log(&db);
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].category, "devices");
        assert_eq!(log[0].target.as_deref(), Some("3151:502d"));
        assert_eq!(log[0].details.as_ref().unwrap()["name"], "Akko Keyboard");
    }

    #[test]
    fn going_back_to_the_default_removes_the_marking() {
        let db = Database::open_in_memory().unwrap();
        let wired = DeviceMarking {
            wireless: false,
            kind: DeviceKind::Mouse,
        };
        set_device_marking(&db, &hid(), "24ae:1416", wired).unwrap();
        let devices = set_device_marking(
            &db,
            &hid(),
            "24ae:1416",
            DeviceMarking {
                wireless: true,
                ..wired
            },
        )
        .unwrap();

        let rapoo = devices.iter().find(|d| d.key == "24ae:1416").unwrap();
        assert!(rapoo.wireless && !rapoo.marked);
        let markings = db
            .with_connection(|connection| device_markings::list(connection))
            .unwrap();
        assert!(markings.is_empty());
        assert_eq!(audit_log(&db).len(), 2);
    }

    #[test]
    fn rejects_invalid_keys_without_side_effects() {
        let db = Database::open_in_memory().unwrap();
        let result = set_device_marking(
            &db,
            &hid(),
            "../x",
            DeviceMarking {
                wireless: true,
                kind: DeviceKind::Mouse,
            },
        );
        assert!(matches!(result, Err(AppError::Validation(_))));
        assert!(audit_log(&db).is_empty());
    }
}
