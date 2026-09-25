//! Providers de bateria — stubs até a Fase 3.
//!
//! Ao implementar, cada provider deve:
//! - apenas LER informações (nenhuma escrita em dispositivos);
//! - retornar `SupportLevel::Unsupported` + `BatteryLevel::Unknown` quando não
//!   conseguir ler, em vez de estimar um valor.

use super::types::{BatteryProviderId, DeviceBatteryInfo, ProviderDescriptor, ProviderStatus};
use super::BatteryProvider;
use crate::error::AppResult;

/// Bluetooth LE Battery Service via APIs do Windows (Windows.Devices.Bluetooth).
pub struct BluetoothBatteryProvider;

impl BatteryProvider for BluetoothBatteryProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: BatteryProviderId::Bluetooth,
            name: "Bluetooth",
            description: "Dispositivos Bluetooth que expõem o Battery Service padrão.",
            status: ProviderStatus::Planned,
        }
    }

    fn list_devices(&self) -> AppResult<Vec<DeviceBatteryInfo>> {
        Ok(Vec::new())
    }
}

/// Controles Xbox via XInput / Windows.Gaming.Input (nível por faixas).
pub struct XInputBatteryProvider;

impl BatteryProvider for XInputBatteryProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: BatteryProviderId::Xinput,
            name: "Controles Xbox",
            description: "Controles via XInput / Windows.Gaming.Input (nível aproximado).",
            status: ProviderStatus::Planned,
        }
    }

    fn list_devices(&self) -> AppResult<Vec<DeviceBatteryInfo>> {
        Ok(Vec::new())
    }
}

/// Periféricos 2.4 GHz com receptor proprietário. Cada modelo será um plugin
/// separado (via `hidapi`), somente leitura.
pub struct HidVendorProvider;

impl BatteryProvider for HidVendorProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: BatteryProviderId::HidVendor,
            name: "Periféricos 2.4 GHz",
            description: "Receptores proprietários; suporte por modelo, via plugins.",
            status: ProviderStatus::Planned,
        }
    }

    fn list_devices(&self) -> AppResult<Vec<DeviceBatteryInfo>> {
        Ok(Vec::new())
    }
}
