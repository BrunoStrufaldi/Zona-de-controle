//! Leitura de dispositivos no Windows — SOMENTE LEITURA.
//!
//! - HID (`hidapi`): lista as interfaces USB para achar receptores. Enumerar não
//!   envia nada ao dispositivo; os relatórios de bateria por modelo (3.3b) vão
//!   repetir apenas a consulta que o software oficial faz.
//! - XInput: estado e bateria dos controles Xbox (slots 0 a 3).
//! - Bluetooth: a propriedade de bateria que o Windows grava nos nós do
//!   dispositivo (a mesma que aparece em Configurações > Bluetooth).
//!
//! Fora do Windows tudo volta vazio.

use std::sync::Mutex;

use crate::domain::devices::{RawBluetoothBattery, RawXInputPad};
#[cfg(not(windows))]
use crate::{domain::devices::RawHidCollection, error::AppResult};

pub struct DeviceReader {
    #[cfg(windows)]
    hid: Mutex<Option<hidapi::HidApi>>,
    #[cfg(not(windows))]
    hid: Mutex<()>,
}

impl DeviceReader {
    pub fn new() -> Self {
        Self {
            hid: Mutex::new(Default::default()),
        }
    }
}

impl Default for DeviceReader {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(windows)]
mod windows_impl {
    use std::mem::zeroed;
    use std::ptr::{null, null_mut};

    use hidapi::{BusType, HidApi};
    use windows_sys::core::GUID;
    use windows_sys::Win32::Devices::DeviceAndDriverInstallation::{
        CM_Get_DevNode_PropertyW, CM_Get_Device_ID_ListW, CM_Get_Device_ID_List_SizeW,
        CM_Locate_DevNodeW, CM_GETIDLIST_FILTER_PRESENT, CM_LOCATE_DEVNODE_NORMAL, CR_BUFFER_SMALL,
        CR_SUCCESS,
    };
    use windows_sys::Win32::Devices::Properties::{
        DEVPKEY_Device_FriendlyName, DEVPROPTYPE, DEVPROP_TYPE_BYTE, DEVPROP_TYPE_STRING,
    };
    use windows_sys::Win32::Foundation::{DEVPROPKEY, ERROR_SUCCESS};
    use windows_sys::Win32::UI::Input::XboxController::{
        XInputGetBatteryInformation, XInputGetState, BATTERY_DEVTYPE_GAMEPAD,
        BATTERY_TYPE_ALKALINE, BATTERY_TYPE_DISCONNECTED, BATTERY_TYPE_NIMH, BATTERY_TYPE_WIRED,
        XINPUT_BATTERY_INFORMATION, XINPUT_STATE, XUSER_MAX_COUNT,
    };

    use super::DeviceReader;
    use crate::domain::devices::{PadPower, RawBluetoothBattery, RawHidCollection, RawXInputPad};
    use crate::error::{AppError, AppResult};

    /// Nível de bateria (0–100) que o Windows grava nos nós Bluetooth. Não é
    /// documentado, mas é a fonte da tela Configurações > Bluetooth.
    const DEVPKEY_BLUETOOTH_BATTERY: DEVPROPKEY = DEVPROPKEY {
        fmtid: GUID::from_u128(0x104ea319_6ee2_4701_bd47_8ddbf425bbe5),
        pid: 2,
    };

    fn device_error(error: hidapi::HidError) -> AppError {
        AppError::Device(format!(
            "não foi possível listar os dispositivos USB: {error}"
        ))
    }

    impl DeviceReader {
        pub fn hid_collections(&self) -> AppResult<Vec<RawHidCollection>> {
            let mut guard = self.hid.lock().map_err(|_| AppError::StatePoisoned)?;
            match guard.as_mut() {
                Some(api) => api.refresh_devices().map_err(device_error)?,
                None => *guard = Some(HidApi::new().map_err(device_error)?),
            }
            let api = guard.as_ref().ok_or(AppError::StatePoisoned)?;
            Ok(api
                .device_list()
                .filter(|info| matches!(info.bus_type(), BusType::Usb))
                .map(|info| RawHidCollection {
                    vendor_id: info.vendor_id(),
                    product_id: info.product_id(),
                    product: info.product_string().unwrap_or_default().to_string(),
                    usage_page: info.usage_page(),
                    usage: info.usage(),
                })
                .collect())
        }
    }

    pub fn xinput_pads() -> Vec<RawXInputPad> {
        (0..XUSER_MAX_COUNT)
            .filter_map(|slot| {
                // SAFETY: estruturas POD zeradas passadas por ponteiro válido.
                let mut state: XINPUT_STATE = unsafe { zeroed() };
                if unsafe { XInputGetState(slot, &mut state) } != ERROR_SUCCESS {
                    return None;
                }
                let mut info: XINPUT_BATTERY_INFORMATION = unsafe { zeroed() };
                let ok = unsafe {
                    XInputGetBatteryInformation(slot, BATTERY_DEVTYPE_GAMEPAD, &mut info)
                } == ERROR_SUCCESS;
                let power = match info.BatteryType {
                    _ if !ok => PadPower::Unknown,
                    BATTERY_TYPE_DISCONNECTED => return None,
                    BATTERY_TYPE_WIRED => PadPower::Wired,
                    BATTERY_TYPE_ALKALINE | BATTERY_TYPE_NIMH => PadPower::Battery,
                    _ => PadPower::Unknown,
                };
                Some(RawXInputPad {
                    slot,
                    power,
                    level: info.BatteryLevel,
                })
            })
            .collect()
    }

    /// Ids (instance ids) dos nós presentes no Windows.
    fn present_device_ids() -> Vec<Vec<u16>> {
        for _ in 0..3 {
            let mut length = 0u32;
            // SAFETY: ponteiros válidos; o buffer tem o tamanho informado pela API.
            if unsafe {
                CM_Get_Device_ID_List_SizeW(&mut length, null(), CM_GETIDLIST_FILTER_PRESENT)
            } != CR_SUCCESS
            {
                return Vec::new();
            }
            let mut buffer = vec![0u16; length as usize];
            let result = unsafe {
                CM_Get_Device_ID_ListW(
                    null(),
                    buffer.as_mut_ptr(),
                    length,
                    CM_GETIDLIST_FILTER_PRESENT,
                )
            };
            if result == CR_BUFFER_SMALL {
                continue; // Um dispositivo entrou entre as duas chamadas.
            }
            if result != CR_SUCCESS {
                return Vec::new();
            }
            return buffer
                .split(|&unit| unit == 0)
                .filter(|id| !id.is_empty())
                .map(|id| id.iter().copied().chain([0]).collect())
                .collect();
        }
        Vec::new()
    }

    /// Lê uma propriedade do nó; `None` se não existir ou for de outro tipo.
    fn read_property(devinst: u32, key: &DEVPROPKEY, expected: DEVPROPTYPE) -> Option<Vec<u8>> {
        let mut kind: DEVPROPTYPE = 0;
        let mut size = 0u32;
        // Primeira chamada: só o tamanho.
        let result =
            unsafe { CM_Get_DevNode_PropertyW(devinst, key, &mut kind, null_mut(), &mut size, 0) };
        if result != CR_BUFFER_SMALL || kind != expected || size == 0 {
            return None;
        }
        let mut buffer = vec![0u8; size as usize];
        let result = unsafe {
            CM_Get_DevNode_PropertyW(devinst, key, &mut kind, buffer.as_mut_ptr(), &mut size, 0)
        };
        (result == CR_SUCCESS && kind == expected).then_some(buffer)
    }

    fn utf16_string(bytes: &[u8]) -> String {
        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .take_while(|&unit| unit != 0)
            .collect();
        String::from_utf16_lossy(&units)
    }

    pub fn bluetooth_batteries() -> Vec<RawBluetoothBattery> {
        present_device_ids()
            .into_iter()
            .filter(|id| {
                let prefix: String = String::from_utf16_lossy(&id[..id.len().min(3)]);
                prefix.eq_ignore_ascii_case("BTH")
            })
            .filter_map(|id| {
                let mut devinst = 0u32;
                // SAFETY: `id` termina em 0 (ver `present_device_ids`).
                if unsafe {
                    CM_Locate_DevNodeW(&mut devinst, id.as_ptr(), CM_LOCATE_DEVNODE_NORMAL)
                } != CR_SUCCESS
                {
                    return None;
                }
                let battery =
                    read_property(devinst, &DEVPKEY_BLUETOOTH_BATTERY, DEVPROP_TYPE_BYTE)?;
                let name =
                    read_property(devinst, &DEVPKEY_Device_FriendlyName, DEVPROP_TYPE_STRING)
                        .map(|bytes| utf16_string(&bytes))?;
                Some(RawBluetoothBattery {
                    name,
                    percent: *battery.first()?,
                })
            })
            .collect()
    }
}

impl DeviceReader {
    /// Interfaces HID dos dispositivos USB conectados.
    #[cfg(not(windows))]
    pub fn hid_collections(&self) -> AppResult<Vec<RawHidCollection>> {
        Ok(Vec::new())
    }

    /// Controles Xbox conectados.
    pub fn xinput_pads(&self) -> Vec<RawXInputPad> {
        #[cfg(windows)]
        return windows_impl::xinput_pads();
        #[cfg(not(windows))]
        Vec::new()
    }

    /// Dispositivos Bluetooth com bateria informada pelo Windows.
    pub fn bluetooth_batteries(&self) -> Vec<RawBluetoothBattery> {
        #[cfg(windows)]
        return windows_impl::bluetooth_batteries();
        #[cfg(not(windows))]
        Vec::new()
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    // Lê o Windows de verdade: confere só invariantes, nunca valores.
    #[test]
    fn reads_the_current_machine_without_panicking() {
        let reader = DeviceReader::new();
        let collections = reader.hid_collections().unwrap();
        // Um segundo pedido reaproveita a instância do hidapi.
        assert_eq!(reader.hid_collections().unwrap().len(), collections.len());
        assert!(reader.xinput_pads().iter().all(|pad| pad.slot < 4));
        assert!(reader
            .bluetooth_batteries()
            .iter()
            .all(|device| !device.name.is_empty()));
    }
}
