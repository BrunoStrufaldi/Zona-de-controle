//! Tipos de dispositivos e bateria. Espelhados em
//! `src/features/system/devices/types.ts` — mantenha os dois em sincronia.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BatteryProviderId {
    /// Dispositivos Bluetooth que expõem o Battery Service (GATT 0x180F).
    Bluetooth,
    /// Controles Xbox via XInput / Windows.Gaming.Input.
    Xinput,
    /// Periféricos HID com protocolo proprietário (plugins por modelo).
    HidVendor,
}

/// Quanto o app consegue ler de um dispositivo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SupportLevel {
    Supported,
    Partial,
    Unsupported,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionType {
    Bluetooth,
    Usb,
    Proprietary24Ghz,
    /// Sem fio, mas sem saber qual tecnologia (ex.: controle Xbox via XInput).
    Wireless,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DeviceKind {
    Controller,
    Mouse,
    Keyboard,
    Headset,
    Other,
}

impl DeviceKind {
    /// Valor gravado no banco (`device_markings.kind`).
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Controller => "controller",
            Self::Mouse => "mouse",
            Self::Keyboard => "keyboard",
            Self::Headset => "headset",
            Self::Other => "other",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        [
            Self::Controller,
            Self::Mouse,
            Self::Keyboard,
            Self::Headset,
            Self::Other,
        ]
        .into_iter()
        .find(|kind| kind.as_str() == value)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ChargingState {
    Charging,
    Discharging,
    Full,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BatteryBucket {
    Empty,
    Low,
    Medium,
    Full,
}

/// Nível de bateria. `Unknown` nunca deve ser convertido em um número estimado.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum BatteryLevel {
    Exact {
        percent: u8,
    },
    Approximate {
        bucket: BatteryBucket,
    },
    /// Alimentado pelo cabo: não há bateria a mostrar.
    Wired,
    /// O leitor do modelo existe, mas o dispositivo ainda não informou.
    Waiting,
    /// O dispositivo informou que está desligado.
    Off,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceBatteryInfo {
    pub id: String,
    pub name: String,
    pub kind: DeviceKind,
    pub connection: ConnectionType,
    pub provider: BatteryProviderId,
    pub support: SupportLevel,
    pub level: BatteryLevel,
    pub charging: ChargingState,
    /// Data/hora ISO 8601 da última leitura.
    pub last_updated: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProviderStatus {
    /// Ainda não implementado.
    Planned,
    Available,
    /// Funciona em parte (ex.: detecta o dispositivo, mas não lê a bateria).
    Partial,
    Unavailable,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDescriptor {
    pub id: BatteryProviderId,
    pub name: &'static str,
    pub description: &'static str,
    pub status: ProviderStatus,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn serializes_with_the_frontend_contract() {
        let device = DeviceBatteryInfo {
            id: "hid-1".into(),
            name: "Mouse".into(),
            kind: DeviceKind::Mouse,
            connection: ConnectionType::Proprietary24Ghz,
            provider: BatteryProviderId::HidVendor,
            support: SupportLevel::Unsupported,
            level: BatteryLevel::Unknown,
            charging: ChargingState::Unknown,
            last_updated: None,
        };

        assert_eq!(
            serde_json::to_value(&device).unwrap(),
            json!({
                "id": "hid-1",
                "name": "Mouse",
                "kind": "mouse",
                "connection": "proprietary24Ghz",
                "provider": "hidVendor",
                "support": "unsupported",
                "level": { "kind": "unknown" },
                "charging": "unknown",
                "lastUpdated": null
            })
        );
    }

    #[test]
    fn serializes_battery_levels_as_tagged_unions() {
        assert_eq!(
            serde_json::to_value(BatteryLevel::Exact { percent: 80 }).unwrap(),
            json!({ "kind": "exact", "percent": 80 })
        );
        assert_eq!(
            serde_json::to_value(BatteryLevel::Approximate {
                bucket: BatteryBucket::Medium
            })
            .unwrap(),
            json!({ "kind": "approximate", "bucket": "medium" })
        );
        assert_eq!(
            serde_json::to_value(BatteryLevel::Waiting).unwrap(),
            json!({ "kind": "waiting" })
        );
        assert_eq!(
            serde_json::to_value(BatteryLevel::Off).unwrap(),
            json!({ "kind": "off" })
        );
        assert_eq!(
            serde_json::to_value(BatteryProviderId::Xinput).unwrap(),
            json!("xinput")
        );
    }
}
