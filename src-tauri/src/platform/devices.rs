//! Leitura de dispositivos no Windows — SOMENTE LEITURA.
//!
//! - HID (`hidapi`): lista as interfaces USB para achar receptores. Enumerar não
//!   envia nada ao dispositivo.
//! - Leitores por modelo: uma thread por modelo com leitor (ver
//!   `domain::devices::readers`) **escuta** a coleção do fabricante e guarda a
//!   última leitura em memória. Nenhum relatório é enviado ao receptor.
//! - XInput: estado e bateria dos controles Xbox (slots 0 a 3).
//! - Bluetooth: a propriedade de bateria que o Windows grava nos nós do
//!   dispositivo (a mesma que aparece em Configurações > Bluetooth).
//!
//! Fora do Windows tudo volta vazio.

use std::sync::{Arc, Mutex};

#[cfg(not(windows))]
use crate::domain::devices::RawHidCollection;
use crate::domain::devices::{ModelReadings, RawBluetoothBattery, RawXInputPad};
use crate::error::{AppError, AppResult};

pub struct DeviceReader {
    #[cfg(windows)]
    hid: Arc<Mutex<Option<hidapi::HidApi>>>,
    /// Última leitura de cada modelo escutado (só em memória).
    readings: Arc<Mutex<ModelReadings>>,
}

impl DeviceReader {
    pub fn new() -> Self {
        Self {
            #[cfg(windows)]
            hid: Arc::new(Mutex::new(None)),
            readings: Arc::new(Mutex::new(ModelReadings::new())),
        }
    }

    /// Cópia das últimas leituras dos modelos com leitor.
    pub fn model_readings(&self) -> AppResult<ModelReadings> {
        Ok(self
            .readings
            .lock()
            .map_err(|_| AppError::StatePoisoned)?
            .clone())
    }

    /// Começa a escutar os receptores dos modelos com leitor (uma thread por
    /// modelo, durante toda a execução do app). Chamado uma vez, no `setup`.
    pub fn start_listeners(&self) {
        #[cfg(windows)]
        windows_impl::start_listeners(&self.hid, &self.readings);
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
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    use hidapi::{BusType, HidApi, HidDevice};
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
    use crate::domain::devices::readers::{ModelReading, ReportReader};
    use crate::domain::devices::{
        device_key, models_with_reader, KnownModel, ModelReadings, PadPower, RawBluetoothBattery,
        RawHidCollection, RawXInputPad,
    };
    use crate::error::{AppError, AppResult};

    /// Nível de bateria (0–100) que o Windows grava nos nós Bluetooth. Não é
    /// documentado, mas é a fonte da tela Configurações > Bluetooth.
    const DEVPKEY_BLUETOOTH_BATTERY: DEVPROPKEY = DEVPROPKEY {
        fmtid: GUID::from_u128(0x104ea319_6ee2_4701_bd47_8ddbf425bbe5),
        pid: 2,
    };

    /// Sem o receptor conectado, procura de novo a cada 5 s.
    const RECONNECT_INTERVAL: Duration = Duration::from_secs(5);
    /// Espera por relatório; o tempo só limita cada chamada de leitura.
    const READ_TIMEOUT_MS: i32 = 1_000;

    type SharedApi = Arc<Mutex<Option<HidApi>>>;

    fn device_error(error: hidapi::HidError) -> AppError {
        AppError::Device(format!(
            "não foi possível listar os dispositivos USB: {error}"
        ))
    }

    /// Atualiza a lista do `hidapi` (ou cria a instância) e roda `use_api`.
    fn with_refreshed_api<T>(hid: &SharedApi, use_api: impl FnOnce(&HidApi) -> T) -> AppResult<T> {
        let mut guard = hid.lock().map_err(|_| AppError::StatePoisoned)?;
        match guard.as_mut() {
            Some(api) => api.refresh_devices().map_err(device_error)?,
            None => *guard = Some(HidApi::new().map_err(device_error)?),
        }
        let api = guard.as_ref().ok_or(AppError::StatePoisoned)?;
        Ok(use_api(api))
    }

    impl DeviceReader {
        pub fn hid_collections(&self) -> AppResult<Vec<RawHidCollection>> {
            with_refreshed_api(&self.hid, |api| {
                api.device_list()
                    .filter(|info| matches!(info.bus_type(), BusType::Usb))
                    .map(|info| RawHidCollection {
                        vendor_id: info.vendor_id(),
                        product_id: info.product_id(),
                        product: info.product_string().unwrap_or_default().to_string(),
                        usage_page: info.usage_page(),
                        usage: info.usage(),
                    })
                    .collect()
            })
        }
    }

    fn unix_now() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_secs() as i64)
    }

    /// Abre só para leitura a coleção do fabricante do modelo, se conectada.
    fn open_collection(hid: &SharedApi, model: &KnownModel, usage_page: u16) -> Option<HidDevice> {
        with_refreshed_api(hid, |api| {
            api.device_list()
                .find(|info| {
                    info.vendor_id() == model.vendor_id
                        && info.product_id() == model.product_id
                        && info.usage_page() == usage_page
                })
                .and_then(|info| info.open_device(api).ok())
        })
        .ok()
        .flatten()
    }

    /// Escuta o receptor para sempre: guarda cada status reconhecido e, se o
    /// receptor sumir, apaga a leitura e volta a procurá-lo.
    fn listen(
        hid: SharedApi,
        readings: Arc<Mutex<ModelReadings>>,
        model: &'static KnownModel,
        reader: ReportReader,
    ) {
        let key = device_key(model.vendor_id, model.product_id);
        let mut buffer = [0u8; 65];
        loop {
            let Some(device) = open_collection(&hid, model, reader.usage_page) else {
                thread::sleep(RECONNECT_INTERVAL);
                continue;
            };
            loop {
                match device.read_timeout(&mut buffer, READ_TIMEOUT_MS) {
                    Ok(0) => {}
                    Ok(length) => {
                        if let Some(status) = (reader.parse)(&buffer[..length]) {
                            if let Ok(mut map) = readings.lock() {
                                let reading = ModelReading::next(map.get(&key), status, unix_now());
                                map.insert(key.clone(), reading);
                            }
                        }
                    }
                    Err(_) => {
                        // Receptor removido: a leitura antiga não vale mais.
                        if let Ok(mut map) = readings.lock() {
                            map.remove(&key);
                        }
                        break;
                    }
                }
            }
            thread::sleep(RECONNECT_INTERVAL);
        }
    }

    pub fn start_listeners(hid: &SharedApi, readings: &Arc<Mutex<ModelReadings>>) {
        for (model, reader) in models_with_reader() {
            let hid = Arc::clone(hid);
            let readings = Arc::clone(readings);
            // Falhar ao criar a thread só deixa o modelo em "aguardando leitura".
            let _ = thread::Builder::new()
                .name(format!("zdc-battery-{}", model.name))
                .spawn(move || listen(hid, readings, model, reader));
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
        // Sem escuta iniciada, nenhuma leitura de modelo.
        assert!(reader.model_readings().unwrap().is_empty());
    }
}
