use tauri::State;

use crate::domain::devices::{DeviceBatteryInfo, ProviderDescriptor};
use crate::error::AppResult;
use crate::state::AppState;

/// Providers de bateria registrados e seu status (somente leitura).
#[tauri::command]
pub async fn list_battery_providers(
    state: State<'_, AppState>,
) -> AppResult<Vec<ProviderDescriptor>> {
    Ok(state.battery_providers.descriptors())
}

/// Dispositivos com informação de bateria (somente leitura).
#[tauri::command]
pub async fn list_battery_devices(state: State<'_, AppState>) -> AppResult<Vec<DeviceBatteryInfo>> {
    state.battery_providers.list_devices()
}
