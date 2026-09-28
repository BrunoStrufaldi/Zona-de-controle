use tauri::State;

use crate::domain::devices::{
    provider_descriptors, DeviceBatteryInfo, DeviceMarking, ProviderDescriptor, UsbInputDevice,
};
use crate::error::AppResult;
use crate::services::devices::{self as service, DeviceReadings};
use crate::state::AppState;

/// Fontes de leitura de bateria e o que cada uma consegue hoje (somente leitura).
#[tauri::command]
pub async fn list_battery_providers() -> AppResult<Vec<ProviderDescriptor>> {
    Ok(provider_descriptors())
}

/// Dispositivos sem fio com a bateria quando legível (somente leitura).
#[tauri::command]
pub async fn list_battery_devices(state: State<'_, AppState>) -> AppResult<Vec<DeviceBatteryInfo>> {
    let readings = DeviceReadings::read(&state.device_reader)?;
    service::list_battery_devices(&state.db, &readings)
}

/// Mouses, teclados e headsets USB conectados, com a classificação (somente leitura).
#[tauri::command]
pub async fn list_usb_input_devices(state: State<'_, AppState>) -> AppResult<Vec<UsbInputDevice>> {
    let hid = state.device_reader.hid_collections()?;
    service::list_usb_devices(&state.db, &hid)
}

/// Marca um dispositivo USB como sem fio (ou não) e o tipo dele (auditado).
#[tauri::command]
pub async fn set_device_marking(
    state: State<'_, AppState>,
    key: String,
    marking: DeviceMarking,
) -> AppResult<Vec<UsbInputDevice>> {
    let hid = state.device_reader.hid_collections()?;
    service::set_device_marking(&state.db, &hid, &key, marking)
}
