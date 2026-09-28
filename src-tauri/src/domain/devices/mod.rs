//! Dispositivos e bateria (Fase 3.3) — regras puras sobre as leituras do SO.
//!
//! No Windows não existe uma API única para bateria de periféricos. Cada fonte
//! é lida em `platform::devices` (somente leitura) e convertida aqui:
//! - receptores USB 2.4 GHz: presença pelo par `vid:pid`; bateria só para
//!   modelos com leitor próprio (3.3b). Pela USB não dá para distinguir um
//!   receptor sem fio de um aparelho com fio, então o usuário marca uma vez
//!   (modelos conhecidos já vêm reconhecidos);
//! - controles Xbox: nível aproximado via XInput;
//! - Bluetooth: a bateria que o próprio Windows informa.
//!
//! Sem leitura, o nível é `Unknown` ("Não disponível") — nunca estimado.

pub mod readers;
// Os tipos formam o contrato com o frontend; algumas variantes (carga completa,
// fonte planejada/indisponível…) ficam reservadas para novos leitores.
#[allow(dead_code)]
mod types;

use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};

pub use types::{
    BatteryBucket, BatteryLevel, BatteryProviderId, ChargingState, ConnectionType,
    DeviceBatteryInfo, DeviceKind, ProviderDescriptor, ProviderStatus, SupportLevel,
};

use crate::error::{AppError, AppResult};
use readers::{ModelReading, ReportReader, ReportedPower, MCHOSE_V9_READER};

/// Página de uso HID "Generic Desktop" e os usos de mouse e teclado.
const USAGE_PAGE_GENERIC_DESKTOP: u16 = 0x01;
const USAGE_MOUSE: u16 = 0x02;
const USAGE_KEYBOARD: u16 = 0x06;
/// Página "Telephony": headsets expõem controles de chamada por ela.
const USAGE_PAGE_TELEPHONY: u16 = 0x0B;

/// Modelo sem fio conhecido: reconhecido sem precisar de marcação.
#[derive(Debug, Clone, Copy)]
pub struct KnownModel {
    pub vendor_id: u16,
    pub product_id: u16,
    pub name: &'static str,
    pub kind: DeviceKind,
    /// Leitor de bateria do modelo (só escuta o receptor), se houver.
    pub reader: Option<ReportReader>,
}

/// Receptores conhecidos (os do usuário, conferidos pelo nome que o receptor informa).
pub const KNOWN_WIRELESS_MODELS: [KnownModel; 2] = [
    // Receptor "Rapoo Gaming Device".
    KnownModel {
        vendor_id: 0x24AE,
        product_id: 0x1416,
        name: "Rapoo VT7 Max",
        kind: DeviceKind::Mouse,
        reader: None,
    },
    // Receptor "MCHOSE V9 PRO" (expõe controles de chamada: é o headset).
    KnownModel {
        vendor_id: 0x291D,
        product_id: 0x385D,
        name: "MCHOSE V9 PRO",
        kind: DeviceKind::Headset,
        reader: Some(MCHOSE_V9_READER),
    },
];

fn known_model(vendor_id: u16, product_id: u16) -> Option<&'static KnownModel> {
    KNOWN_WIRELESS_MODELS
        .iter()
        .find(|model| model.vendor_id == vendor_id && model.product_id == product_id)
}

/// Chave estável de um dispositivo USB: `vid:pid` em hexadecimal minúsculo.
pub fn device_key(vendor_id: u16, product_id: u16) -> String {
    format!("{vendor_id:04x}:{product_id:04x}")
}

/// Valida uma chave vinda do frontend (mesmo formato da tabela `device_markings`).
pub fn parse_device_key(key: &str) -> AppResult<(u16, u16)> {
    let invalid =
        || AppError::Validation(format!("identificador de dispositivo inválido: \"{key}\""));
    let (vendor, product) = key.split_once(':').ok_or_else(invalid)?;
    let parse = |part: &str| {
        if part.len() == 4
            && part
                .chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        {
            u16::from_str_radix(part, 16).map_err(|_| invalid())
        } else {
            Err(invalid())
        }
    };
    Ok((parse(vendor)?, parse(product)?))
}

/// Uma coleção HID (interface) lida do SO. Só barramento USB.
#[derive(Debug, Clone)]
pub struct RawHidCollection {
    pub vendor_id: u16,
    pub product_id: u16,
    /// Nome que o dispositivo informa (pode ser vazio).
    pub product: String,
    pub usage_page: u16,
    pub usage: u16,
}

/// Escolha do usuário para um dispositivo USB.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceMarking {
    pub wireless: bool,
    pub kind: DeviceKind,
}

/// Mouse, teclado ou headset USB conectado agora, com a classificação aplicada.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsbInputDevice {
    pub key: String,
    pub name: String,
    /// Nome informado pelo receptor/dispositivo (ex.: "Rapoo Gaming Device").
    pub product_name: String,
    pub kind: DeviceKind,
    /// Tipo sugerido pelas interfaces e pelo nome (usado ao marcar).
    pub suggested_kind: DeviceKind,
    /// Tratado como sem fio (entra na lista de bateria).
    pub wireless: bool,
    /// Modelo conhecido pelo app.
    pub known: bool,
    /// O usuário mudou o padrão para este dispositivo.
    pub marked: bool,
}

fn contains_any(text: &str, words: &[&str]) -> bool {
    words.iter().any(|word| text.contains(word))
}

/// Sugere o tipo pelo nome e, se ele não disser nada, pelas interfaces HID.
/// Receptores costumam expor mouse **e** teclado (teclas de macro), então os
/// dois juntos não decidem nada.
pub fn suggest_kind(name: &str, usages: &[(u16, u16)]) -> DeviceKind {
    let name = name.to_lowercase();
    if contains_any(&name, &["headset", "headphone", "fone", "earbud", "buds"]) {
        return DeviceKind::Headset;
    }
    if contains_any(&name, &["mouse"]) {
        return DeviceKind::Mouse;
    }
    if contains_any(&name, &["keyboard", "teclado"]) {
        return DeviceKind::Keyboard;
    }
    if contains_any(&name, &["controller", "gamepad", "controle"]) {
        return DeviceKind::Controller;
    }
    let has = |page: u16, usage: Option<u16>| {
        usages
            .iter()
            .any(|&(p, u)| p == page && usage.map_or(true, |expected| expected == u))
    };
    if has(USAGE_PAGE_TELEPHONY, None) {
        return DeviceKind::Headset;
    }
    match (
        has(USAGE_PAGE_GENERIC_DESKTOP, Some(USAGE_MOUSE)),
        has(USAGE_PAGE_GENERIC_DESKTOP, Some(USAGE_KEYBOARD)),
    ) {
        (true, false) => DeviceKind::Mouse,
        (false, true) => DeviceKind::Keyboard,
        _ => DeviceKind::Other,
    }
}

fn is_input_usage(usage_page: u16, usage: u16) -> bool {
    (usage_page == USAGE_PAGE_GENERIC_DESKTOP && matches!(usage, USAGE_MOUSE | USAGE_KEYBOARD))
        || usage_page == USAGE_PAGE_TELEPHONY
}

/// Interfaces de um mesmo `vid:pid`.
#[derive(Default)]
struct UsbGroup {
    product: String,
    /// Pares (página de uso, uso) de cada interface.
    usages: Vec<(u16, u16)>,
}

/// Agrupa as coleções HID por `vid:pid`, mantém só mouses, teclados e headsets e
/// aplica modelos conhecidos e marcações do usuário (a marcação prevalece).
pub fn list_usb_input_devices(
    raw: &[RawHidCollection],
    markings: &HashMap<String, DeviceMarking>,
) -> Vec<UsbInputDevice> {
    let mut grouped: BTreeMap<(u16, u16), UsbGroup> = BTreeMap::new();
    for collection in raw {
        let group = grouped
            .entry((collection.vendor_id, collection.product_id))
            .or_default();
        if group.product.is_empty() {
            group.product = collection.product.trim().to_string();
        }
        group.usages.push((collection.usage_page, collection.usage));
    }

    let mut devices: Vec<UsbInputDevice> = grouped
        .into_iter()
        .filter(|(_, group)| {
            group
                .usages
                .iter()
                .any(|&(page, usage)| is_input_usage(page, usage))
        })
        .map(|((vendor_id, product_id), UsbGroup { product, usages })| {
            let key = device_key(vendor_id, product_id);
            let known = known_model(vendor_id, product_id);
            let suggested_kind = known.map_or_else(|| suggest_kind(&product, &usages), |m| m.kind);
            let marking = markings.get(&key).copied();
            let product_name = if product.is_empty() {
                format!("Dispositivo USB {key}")
            } else {
                product
            };
            UsbInputDevice {
                name: known.map_or_else(|| product_name.clone(), |m| m.name.to_string()),
                product_name,
                kind: marking.map_or(suggested_kind, |m| m.kind),
                suggested_kind,
                wireless: marking.map_or(known.is_some(), |m| m.wireless),
                known: known.is_some(),
                marked: marking.is_some(),
                key,
            }
        })
        .collect();
    // Sem fio primeiro; depois pelo nome.
    devices.sort_by(|a, b| {
        b.wireless
            .cmp(&a.wireless)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    devices
}

/// `None` quando a escolha é igual ao padrão (a marcação pode ser apagada):
/// modelo conhecido sem fio com o tipo dele, ou desconhecido "com fio".
pub fn normalize_marking(
    vendor_id: u16,
    product_id: u16,
    marking: DeviceMarking,
) -> Option<DeviceMarking> {
    let is_default = match known_model(vendor_id, product_id) {
        Some(model) => marking.wireless && marking.kind == model.kind,
        None => !marking.wireless,
    };
    (!is_default).then_some(marking)
}

/// Modelos conhecidos com leitor de bateria (a plataforma escuta cada um).
pub fn models_with_reader() -> impl Iterator<Item = (&'static KnownModel, ReportReader)> {
    KNOWN_WIRELESS_MODELS
        .iter()
        .filter_map(|model| model.reader.map(|reader| (model, reader)))
}

/// Última leitura de cada modelo escutado, pela chave `vid:pid`.
pub type ModelReadings = HashMap<String, ModelReading>;

fn has_reader(key: &str) -> bool {
    parse_device_key(key)
        .ok()
        .and_then(|(vendor_id, product_id)| known_model(vendor_id, product_id))
        .is_some_and(|model| model.reader.is_some())
}

/// Nível, carregamento e suporte de um receptor, pela última leitura.
fn usb_battery_state(
    key: &str,
    readings: &ModelReadings,
    read_at: &impl Fn(i64) -> Option<String>,
) -> (SupportLevel, BatteryLevel, ChargingState, Option<String>) {
    let Some(reading) = readings.get(key) else {
        return if has_reader(key) {
            (
                SupportLevel::Supported,
                BatteryLevel::Waiting,
                ChargingState::Unknown,
                None,
            )
        } else {
            (
                SupportLevel::Unsupported,
                BatteryLevel::Unknown,
                ChargingState::Unknown,
                None,
            )
        };
    };
    let percent = reading.status.percent;
    let (level, charging) = match reading.status.power {
        ReportedPower::Off => (
            BatteryLevel::Off {
                last_percent: reading.last_percent,
            },
            ChargingState::Unknown,
        ),
        ReportedPower::Charging => (BatteryLevel::Exact { percent }, ChargingState::Charging),
        ReportedPower::OnBattery => (BatteryLevel::Exact { percent }, ChargingState::Discharging),
    };
    (
        SupportLevel::Supported,
        level,
        charging,
        read_at(reading.read_at_unix),
    )
}

/// Dispositivos USB sem fio na lista de bateria. Sem leitor do modelo, o
/// receptor aparece como presente e a bateria como "Não disponível"; com
/// leitor, mostra a última leitura ou "aguardando" até o primeiro aviso.
/// `read_at` converte o instante Unix da leitura em texto ISO 8601.
pub fn usb_battery_devices(
    devices: &[UsbInputDevice],
    readings: &ModelReadings,
    read_at: impl Fn(i64) -> Option<String>,
) -> Vec<DeviceBatteryInfo> {
    devices
        .iter()
        .filter(|device| device.wireless)
        .map(|device| {
            let (support, level, charging, last_updated) =
                usb_battery_state(&device.key, readings, &read_at);
            DeviceBatteryInfo {
                id: format!("usb:{}", device.key),
                name: device.name.clone(),
                kind: device.kind,
                connection: ConnectionType::Proprietary24Ghz,
                provider: BatteryProviderId::HidVendor,
                support,
                level,
                charging,
                last_updated,
            }
        })
        .collect()
}

/// Tipo de alimentação informado pelo XInput.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PadPower {
    Wired,
    Battery,
    Unknown,
}

/// Controle conectado em um dos 4 slots do XInput.
#[derive(Debug, Clone, Copy)]
pub struct RawXInputPad {
    /// 0 a 3.
    pub slot: u32,
    pub power: PadPower,
    /// 0 (vazia) a 3 (cheia), como o XInput informa.
    pub level: u8,
}

fn bucket_for(level: u8) -> Option<BatteryBucket> {
    match level {
        0 => Some(BatteryBucket::Empty),
        1 => Some(BatteryBucket::Low),
        2 => Some(BatteryBucket::Medium),
        3 => Some(BatteryBucket::Full),
        _ => None,
    }
}

pub fn xinput_battery_devices(pads: &[RawXInputPad], read_at: &str) -> Vec<DeviceBatteryInfo> {
    pads.iter()
        .map(|pad| {
            let (connection, support, level) = match (pad.power, bucket_for(pad.level)) {
                (PadPower::Wired, _) => (
                    ConnectionType::Usb,
                    SupportLevel::Supported,
                    BatteryLevel::Wired,
                ),
                (PadPower::Battery, Some(bucket)) => (
                    ConnectionType::Wireless,
                    SupportLevel::Partial,
                    BatteryLevel::Approximate { bucket },
                ),
                _ => (
                    ConnectionType::Wireless,
                    SupportLevel::Unsupported,
                    BatteryLevel::Unknown,
                ),
            };
            let measured = !matches!(level, BatteryLevel::Unknown);
            DeviceBatteryInfo {
                id: format!("xinput:{}", pad.slot),
                name: format!("Controle Xbox (jogador {})", pad.slot + 1),
                kind: DeviceKind::Controller,
                connection,
                provider: BatteryProviderId::Xinput,
                support,
                level,
                charging: ChargingState::Unknown,
                last_updated: measured.then(|| read_at.to_string()),
            }
        })
        .collect()
}

/// Dispositivo Bluetooth com a bateria que o Windows informa (0 a 100).
#[derive(Debug, Clone)]
pub struct RawBluetoothBattery {
    pub name: String,
    pub percent: u8,
}

/// Um dispositivo Bluetooth pode ter vários nós no Windows com a mesma
/// bateria; fica um por nome.
pub fn bluetooth_battery_devices(
    raw: &[RawBluetoothBattery],
    read_at: &str,
) -> Vec<DeviceBatteryInfo> {
    let mut by_name: BTreeMap<String, &RawBluetoothBattery> = BTreeMap::new();
    for device in raw {
        let name = device.name.trim();
        if !name.is_empty() && device.percent <= 100 {
            by_name.entry(name.to_string()).or_insert(device);
        }
    }
    by_name
        .into_iter()
        .map(|(name, device)| DeviceBatteryInfo {
            id: format!("bt:{}", name.to_lowercase()),
            kind: suggest_kind(&name, &[]),
            name,
            connection: ConnectionType::Bluetooth,
            provider: BatteryProviderId::Bluetooth,
            support: SupportLevel::Supported,
            level: BatteryLevel::Exact {
                percent: device.percent,
            },
            charging: ChargingState::Unknown,
            last_updated: Some(read_at.to_string()),
        })
        .collect()
}

/// Fontes de leitura e o que cada uma consegue hoje.
pub fn provider_descriptors() -> Vec<ProviderDescriptor> {
    vec![
        ProviderDescriptor {
            id: BatteryProviderId::HidVendor,
            name: "Receptores 2.4 GHz",
            description: "Detecta o receptor USB. Bateria só nos modelos com leitor próprio (hoje: headset MCHOSE V9 PRO), escutando o que o receptor informa.",
            status: ProviderStatus::Partial,
        },
        ProviderDescriptor {
            id: BatteryProviderId::Xinput,
            name: "Controles Xbox",
            description: "Nível aproximado (vazia, baixa, média, cheia) pelo XInput do Windows.",
            status: ProviderStatus::Available,
        },
        ProviderDescriptor {
            id: BatteryProviderId::Bluetooth,
            name: "Bluetooth",
            description: "A bateria que o próprio Windows informa para dispositivos Bluetooth pareados.",
            status: ProviderStatus::Available,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn collection(vid: u16, pid: u16, product: &str, page: u16, usage: u16) -> RawHidCollection {
        RawHidCollection {
            vendor_id: vid,
            product_id: pid,
            product: product.into(),
            usage_page: page,
            usage,
        }
    }

    /// O que o PC do usuário expõe hoje (conferido no Windows).
    fn user_machine() -> Vec<RawHidCollection> {
        vec![
            collection(0x24AE, 0x1416, "Rapoo Gaming Device", 0x01, USAGE_KEYBOARD),
            collection(0x24AE, 0x1416, "Rapoo Gaming Device", 0x01, USAGE_MOUSE),
            collection(0x24AE, 0x1416, "Rapoo Gaming Device", 0xFF00, 0x01),
            collection(0x291D, 0x385D, "MCHOSE V9 PRO", 0x0C, 0x01),
            collection(0x291D, 0x385D, "MCHOSE V9 PRO", USAGE_PAGE_TELEPHONY, 0x05),
            collection(0x3151, 0x502D, "Akko Keyboard", 0x01, USAGE_KEYBOARD),
            collection(0x3151, 0x502D, "Akko Keyboard", 0x01, USAGE_MOUSE),
            // Controlador de LED e microfone: sem interface de entrada, ficam de fora.
            collection(0x0B05, 0x19AF, "AURA LED Controller", 0xFF72, 0xA1),
            collection(0x3142, 0xA010, "fifine Microphone", 0x0C, 0x01),
        ]
    }

    #[test]
    fn device_keys_round_trip_and_reject_bad_input() {
        assert_eq!(device_key(0x24AE, 0x1416), "24ae:1416");
        assert_eq!(parse_device_key("24ae:1416").unwrap(), (0x24AE, 0x1416));
        for bad in ["24AE:1416", "24ae1416", "24ae:141", "zzzz:1416", ""] {
            assert!(parse_device_key(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn suggests_kind_by_name_then_by_interfaces() {
        assert_eq!(suggest_kind("Wireless Mouse", &[]), DeviceKind::Mouse);
        assert_eq!(suggest_kind("Fone JBL", &[]), DeviceKind::Headset);
        assert_eq!(
            suggest_kind("Receiver", &[(USAGE_PAGE_TELEPHONY, 0x05)]),
            DeviceKind::Headset
        );
        assert_eq!(
            suggest_kind("Receiver", &[(0x01, USAGE_MOUSE)]),
            DeviceKind::Mouse
        );
        // Mouse e teclado juntos (típico de receptor): não dá para saber.
        assert_eq!(
            suggest_kind(
                "Gaming Device",
                &[(0x01, USAGE_MOUSE), (0x01, USAGE_KEYBOARD)]
            ),
            DeviceKind::Other
        );
    }

    #[test]
    fn recognizes_known_models_and_lists_others_as_candidates() {
        let devices = list_usb_input_devices(&user_machine(), &HashMap::new());

        let summary: Vec<_> = devices
            .iter()
            .map(|d| (d.key.as_str(), d.name.as_str(), d.kind, d.wireless, d.known))
            .collect();
        assert_eq!(
            summary,
            [
                (
                    "291d:385d",
                    "MCHOSE V9 PRO",
                    DeviceKind::Headset,
                    true,
                    true
                ),
                ("24ae:1416", "Rapoo VT7 Max", DeviceKind::Mouse, true, true),
                (
                    "3151:502d",
                    "Akko Keyboard",
                    DeviceKind::Keyboard,
                    false,
                    false
                ),
            ]
        );
        assert_eq!(devices[1].product_name, "Rapoo Gaming Device");

        let battery = usb_battery_devices(&devices, &ModelReadings::new(), |_| None);
        assert_eq!(battery.len(), 2);
        // Headset com leitor, sem aviso ainda: aguardando (não "Não disponível").
        assert_eq!(battery[0].level, BatteryLevel::Waiting);
        assert_eq!(battery[0].support, SupportLevel::Supported);
        // Mouse sem leitor: presente, bateria não disponível.
        assert_eq!(battery[1].id, "usb:24ae:1416");
        assert_eq!(battery[1].connection, ConnectionType::Proprietary24Ghz);
        assert_eq!(battery[1].level, BatteryLevel::Unknown);
    }

    #[test]
    fn shows_the_last_reading_of_models_with_a_reader() {
        use readers::ReportedStatus;

        let devices = list_usb_input_devices(&user_machine(), &HashMap::new());
        let reading = |percent, power| ModelReading {
            status: ReportedStatus { percent, power },
            read_at_unix: 1_790_000_000,
            last_percent: Some(90),
        };
        let read_at = |unix: i64| Some(format!("t{unix}"));

        let charging = ModelReadings::from([(
            "291d:385d".to_string(),
            reading(64, ReportedPower::Charging),
        )]);
        let headset = &usb_battery_devices(&devices, &charging, read_at)[0];
        assert_eq!(headset.level, BatteryLevel::Exact { percent: 64 });
        assert_eq!(headset.charging, ChargingState::Charging);
        assert_eq!(headset.last_updated.as_deref(), Some("t1790000000"));

        let off = ModelReadings::from([("291d:385d".to_string(), reading(0, ReportedPower::Off))]);
        let headset = &usb_battery_devices(&devices, &off, read_at)[0];
        // Desligado: mostra o último nível informado com ele ligado.
        assert_eq!(
            headset.level,
            BatteryLevel::Off {
                last_percent: Some(90)
            }
        );
    }

    #[test]
    fn only_the_headset_has_a_reader_today() {
        let keys: Vec<_> = models_with_reader()
            .map(|(model, reader)| {
                (
                    device_key(model.vendor_id, model.product_id),
                    reader.usage_page,
                )
            })
            .collect();
        assert_eq!(keys, [("291d:385d".to_string(), 0xFF90)]);
    }

    #[test]
    fn user_markings_override_the_defaults() {
        let markings = HashMap::from([
            (
                "3151:502d".to_string(),
                DeviceMarking {
                    wireless: true,
                    kind: DeviceKind::Keyboard,
                },
            ),
            (
                "24ae:1416".to_string(),
                DeviceMarking {
                    wireless: false,
                    kind: DeviceKind::Mouse,
                },
            ),
        ]);
        let devices = list_usb_input_devices(&user_machine(), &markings);
        let wireless: Vec<_> = devices
            .iter()
            .filter(|d| d.wireless)
            .map(|d| d.key.as_str())
            .collect();
        assert_eq!(wireless, ["3151:502d", "291d:385d"]);
        assert!(
            devices
                .iter()
                .find(|d| d.key == "24ae:1416")
                .unwrap()
                .marked
        );
    }

    #[test]
    fn markings_equal_to_the_default_are_dropped() {
        let mouse = |wireless| DeviceMarking {
            wireless,
            kind: DeviceKind::Mouse,
        };
        // Modelo conhecido (Rapoo): sem fio como mouse é o padrão.
        assert_eq!(normalize_marking(0x24AE, 0x1416, mouse(true)), None);
        assert_eq!(
            normalize_marking(0x24AE, 0x1416, mouse(false)),
            Some(mouse(false))
        );
        // Desconhecido: "com fio" é o padrão.
        assert_eq!(normalize_marking(0x1234, 0x5678, mouse(false)), None);
        assert_eq!(
            normalize_marking(0x1234, 0x5678, mouse(true)),
            Some(mouse(true))
        );
    }

    #[test]
    fn nameless_devices_get_a_generic_name() {
        let raw = [collection(0x1234, 0x5678, "  ", 0x01, USAGE_MOUSE)];
        let devices = list_usb_input_devices(&raw, &HashMap::new());
        assert_eq!(devices[0].name, "Dispositivo USB 1234:5678");
    }

    #[test]
    fn converts_xbox_controllers() {
        let pads = [
            RawXInputPad {
                slot: 0,
                power: PadPower::Battery,
                level: 2,
            },
            RawXInputPad {
                slot: 1,
                power: PadPower::Wired,
                level: 0,
            },
            RawXInputPad {
                slot: 2,
                power: PadPower::Unknown,
                level: 3,
            },
        ];
        let devices = xinput_battery_devices(&pads, "2026-09-28T12:00:00Z");

        assert_eq!(devices[0].name, "Controle Xbox (jogador 1)");
        assert_eq!(
            devices[0].level,
            BatteryLevel::Approximate {
                bucket: BatteryBucket::Medium
            }
        );
        assert_eq!(devices[0].support, SupportLevel::Partial);
        assert_eq!(
            devices[0].last_updated.as_deref(),
            Some("2026-09-28T12:00:00Z")
        );
        assert_eq!(devices[1].level, BatteryLevel::Wired);
        assert_eq!(devices[1].connection, ConnectionType::Usb);
        // Tipo desconhecido: nunca inventa a faixa.
        assert_eq!(devices[2].level, BatteryLevel::Unknown);
        assert_eq!(devices[2].last_updated, None);
    }

    #[test]
    fn converts_bluetooth_devices_one_per_name() {
        let raw = [
            RawBluetoothBattery {
                name: "Fone Bluetooth".into(),
                percent: 80,
            },
            RawBluetoothBattery {
                name: "Fone Bluetooth".into(),
                percent: 80,
            },
            RawBluetoothBattery {
                name: "Sensor".into(),
                percent: 250,
            },
        ];
        let devices = bluetooth_battery_devices(&raw, "2026-09-28T12:00:00Z");

        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].kind, DeviceKind::Headset);
        assert_eq!(devices[0].level, BatteryLevel::Exact { percent: 80 });
        assert_eq!(devices[0].connection, ConnectionType::Bluetooth);
    }

    #[test]
    fn describes_the_three_sources() {
        let descriptors = provider_descriptors();
        assert_eq!(descriptors.len(), 3);
        assert_eq!(descriptors[0].status, ProviderStatus::Partial);
    }
}
