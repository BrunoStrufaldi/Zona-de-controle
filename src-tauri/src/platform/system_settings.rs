//! Leitura das configurações do Windows e do hardware (4.5) — SOMENTE LEITURA,
//! sem administrador e sem WMI (que exigiria COM no processo):
//!
//! - energia: `powrprof` (planos, ativo, Modern Standby, bateria);
//! - Modo de Jogo, reinício pendente, inicialização, Secure Boot e CPU: registro;
//! - HAGS: `D3DKMTQueryAdapterInfo` (o registro nem sempre diz o estado);
//! - BIOS, placa e RAM: tabelas SMBIOS (`GetSystemFirmwareTable`), lidas em
//!   `domain::system_settings::smbios` sem seriais;
//! - TPM: `Tbsi_GetDeviceInfo`; virtualização: CPUID + `IsProcessorFeaturePresent`;
//!   Integridade da memória: `NtQuerySystemInformation`.
//!
//! Fora do Windows tudo volta como "não disponível".

use crate::domain::system_settings::hardware::RawHardware;
use crate::domain::system_settings::{RawWindowsSettings, SystemSettingsReader};

pub struct WindowsSettingsReader;

impl SystemSettingsReader for WindowsSettingsReader {
    fn windows_settings(&self) -> RawWindowsSettings {
        imp::windows_settings()
    }

    fn hardware(&self) -> RawHardware {
        imp::hardware()
    }
}

#[cfg(not(windows))]
mod imp {
    use crate::domain::system_settings::hardware::RawHardware;
    use crate::domain::system_settings::RawWindowsSettings;

    pub fn windows_settings() -> RawWindowsSettings {
        RawWindowsSettings::default()
    }

    pub fn hardware() -> RawHardware {
        RawHardware::default()
    }
}

#[cfg(windows)]
mod imp {
    use std::collections::HashMap;
    use std::mem::{size_of, zeroed};
    use std::path::{Path, PathBuf};
    use std::ptr::{null, null_mut};

    use windows_sys::core::GUID;
    use windows_sys::Wdk::Graphics::Direct3D::{
        D3DKMTCloseAdapter, D3DKMTEnumAdapters2, D3DKMTQueryAdapterInfo, D3DKMT_ADAPTERINFO,
        D3DKMT_ADAPTERREGISTRYINFO, D3DKMT_ADAPTERTYPE, D3DKMT_CLOSEADAPTER, D3DKMT_ENUMADAPTERS2,
        D3DKMT_QUERYADAPTERINFO, D3DKMT_WDDM_2_7_CAPS, KMTQAITYPE_ADAPTERREGISTRYINFO,
        KMTQAITYPE_ADAPTERTYPE, KMTQAITYPE_WDDM_2_7_CAPS, KMTQUERYADAPTERINFOTYPE,
    };
    use windows_sys::Wdk::System::SystemInformation::{
        NtQuerySystemInformation, SystemCodeIntegrityInformation,
    };
    use windows_sys::Win32::Foundation::{
        LocalFree, ERROR_NO_MORE_ITEMS, ERROR_SUCCESS, TBS_E_TPM_NOT_FOUND,
    };
    use windows_sys::Win32::System::Power::{
        GetPwrCapabilities, PowerEnumerate, PowerGetActiveScheme, PowerReadFriendlyName,
        ACCESS_SCHEME, SYSTEM_POWER_CAPABILITIES,
    };
    use windows_sys::Win32::System::SystemInformation::{
        FirmwareTypeBios, FirmwareTypeUefi, GetFirmwareType, GetSystemFirmwareTable, RSMB,
    };
    use windows_sys::Win32::System::Threading::{
        IsProcessorFeaturePresent, PF_VIRT_FIRMWARE_ENABLED,
    };
    use windows_sys::Win32::System::TpmBaseServices::{
        Tbsi_GetDeviceInfo, TPM_DEVICE_INFO, TPM_VERSION_12, TPM_VERSION_20,
    };
    use windows_sys::Win32::System::WindowsProgramming::{
        CODEINTEGRITY_OPTION_HVCI_KMCI_ENABLED, SYSTEM_CODEINTEGRITY_INFORMATION,
    };

    use crate::domain::system_settings::hardware::{FirmwareKind, RawHardware, TpmStatus};
    use crate::domain::system_settings::power::{RawPower, RawPowerPlan};
    use crate::domain::system_settings::startup::{
        expand_env, target_exists, RawPackagedTask, RawStartup, RawStartupEntry, StartupLocation,
    };
    use crate::domain::system_settings::{PendingReboot, RawGpu, RawWindowsSettings, StoredDword};
    use crate::platform::registry::{self, from_wide, Hive, RegValue};

    const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const RUN32: &str = r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run";
    const APPROVED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved";
    const PACKAGED_TASKS: &str = r"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData";
    const GAME_BAR: &str = r"Software\Microsoft\GameBar";
    const WINDOWS_UPDATE_REBOOT: &str =
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired";
    const SERVICING_REBOOT: &str =
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending";
    const SECURE_BOOT: &str = r"SYSTEM\CurrentControlSet\Control\SecureBoot\State";
    const CPU: &str = r"HARDWARE\DESCRIPTION\System\CentralProcessor\0";
    const STARTUP_FOLDER: [&str; 5] = ["Microsoft", "Windows", "Start Menu", "Programs", "Startup"];

    /// Bit `SoftwareDevice` de `D3DKMT_ADAPTERTYPE` (ex.: Microsoft Basic Render Driver).
    const SOFTWARE_DEVICE_BIT: u32 = 1 << 2;
    /// Bits `HwSchSupported` e `HwSchEnabled` de `D3DKMT_WDDM_2_7_CAPS`.
    const HAGS_SUPPORTED_BIT: u32 = 1 << 0;
    const HAGS_ENABLED_BIT: u32 = 1 << 1;

    pub fn windows_settings() -> RawWindowsSettings {
        RawWindowsSettings {
            power: power(),
            game_mode: game_mode(),
            gpus: gpus(),
            pending_reboot: pending_reboot(),
            startup: startup(),
        }
    }

    pub fn hardware() -> RawHardware {
        let cpu = registry::open(Hive::LocalMachine, CPU).ok().flatten();
        let cpu_text = |name: &str| {
            cpu.as_ref()
                .and_then(|key| key.text(name).ok().flatten())
                .map(|text| text.trim().to_string())
                .filter(|text| !text.is_empty())
        };
        RawHardware {
            smbios: smbios(),
            firmware: firmware(),
            secure_boot: registry::open(Hive::LocalMachine, SECURE_BOOT)
                .ok()
                .flatten()
                .and_then(|key| key.dword("UEFISecureBootEnabled").ok().flatten())
                .map(|value| value != 0),
            tpm: tpm(),
            cpu_vendor: cpu_text("VendorIdentifier"),
            cpu_identifier: cpu_text("Identifier"),
            cpu_name: cpu_text("ProcessorNameString"),
            microcode: cpu
                .as_ref()
                .and_then(|key| key.binary("Update Revision").ok().flatten()),
            hypervisor_present: hypervisor_present(),
            // SAFETY: consulta sem efeitos colaterais.
            virtualization_firmware: Some(
                unsafe { IsProcessorFeaturePresent(PF_VIRT_FIRMWARE_ENABLED) } != 0,
            ),
            memory_integrity: memory_integrity(),
        }
    }

    fn format_guid(guid: &GUID) -> String {
        let d = guid.data4;
        format!(
            "{:08x}-{:04x}-{:04x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
            guid.data1, guid.data2, guid.data3, d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7]
        )
    }

    fn plan_name(guid: &GUID) -> Option<String> {
        let mut size = 0u32;
        // SAFETY: primeira chamada só consulta o tamanho (buffer nulo).
        let result = unsafe {
            PowerReadFriendlyName(null_mut(), guid, null(), null(), null_mut(), &mut size)
        };
        if result != ERROR_SUCCESS || size == 0 {
            return None;
        }
        let mut buffer = vec![0u16; (size as usize).div_ceil(2)];
        // SAFETY: `buffer` tem pelo menos `size` bytes.
        let result = unsafe {
            PowerReadFriendlyName(
                null_mut(),
                guid,
                null(),
                null(),
                buffer.as_mut_ptr().cast(),
                &mut size,
            )
        };
        (result == ERROR_SUCCESS)
            .then(|| from_wide(&buffer))
            .filter(|name| !name.trim().is_empty())
    }

    fn power() -> Option<RawPower> {
        let mut plans = Vec::new();
        for index in 0.. {
            // SAFETY: GUID é POD.
            let mut guid: GUID = unsafe { zeroed() };
            let mut size = size_of::<GUID>() as u32;
            // SAFETY: `guid` tem o tamanho informado.
            let result = unsafe {
                PowerEnumerate(
                    null_mut(),
                    null(),
                    null(),
                    ACCESS_SCHEME,
                    index,
                    (&mut guid as *mut GUID).cast(),
                    &mut size,
                )
            };
            if result == ERROR_NO_MORE_ITEMS {
                break;
            }
            if result != ERROR_SUCCESS {
                return None;
            }
            let id = format_guid(&guid);
            plans.push(RawPowerPlan {
                name: plan_name(&guid).unwrap_or_else(|| id.clone()),
                guid: id,
            });
        }

        let mut active: *mut GUID = null_mut();
        // SAFETY: o Windows aloca o GUID ativo; liberado com LocalFree abaixo.
        let active_guid = if unsafe { PowerGetActiveScheme(null_mut(), &mut active) }
            == ERROR_SUCCESS
            && !active.is_null()
        {
            // SAFETY: `active` aponta para um GUID válido até o LocalFree.
            let id = format_guid(unsafe { &*active });
            // SAFETY: memória alocada pelo Windows para este chamador.
            unsafe { LocalFree(active.cast()) };
            Some(id)
        } else {
            None
        };

        // SAFETY: struct POD preenchida pela API.
        let mut capabilities: SYSTEM_POWER_CAPABILITIES = unsafe { zeroed() };
        // SAFETY: ponteiro para a struct acima.
        let capabilities_read = unsafe { GetPwrCapabilities(&mut capabilities) };
        Some(RawPower {
            plans,
            active_guid,
            modern_standby: capabilities_read && capabilities.AoAc,
            has_battery: capabilities_read && capabilities.SystemBatteriesPresent,
        })
    }

    fn game_mode() -> Option<StoredDword> {
        match registry::open(Hive::CurrentUser, GAME_BAR) {
            Ok(None) => Some(StoredDword::Absent),
            Ok(Some(key)) => match key.dword("AutoGameModeEnabled") {
                Ok(Some(value)) => Some(StoredDword::Value(value)),
                Ok(None) => Some(StoredDword::Absent),
                Err(_) => None,
            },
            Err(_) => None,
        }
    }

    fn pending_reboot() -> Option<PendingReboot> {
        Some(PendingReboot {
            windows_update: registry::exists(Hive::LocalMachine, WINDOWS_UPDATE_REBOOT)?,
            servicing: registry::exists(Hive::LocalMachine, SERVICING_REBOOT)?,
        })
    }

    fn query_adapter<T: Default>(adapter: u32, kind: KMTQUERYADAPTERINFOTYPE) -> Option<T> {
        let mut data = T::default();
        let mut request = D3DKMT_QUERYADAPTERINFO {
            hAdapter: adapter,
            Type: kind,
            pPrivateDriverData: (&mut data as *mut T).cast(),
            PrivateDriverDataSize: size_of::<T>() as u32,
        };
        // SAFETY: `data` tem o tamanho informado e vive até o fim da chamada.
        (unsafe { D3DKMTQueryAdapterInfo(&mut request) } >= 0).then_some(data)
    }

    fn gpus() -> Option<Vec<RawGpu>> {
        let mut enumerate = D3DKMT_ENUMADAPTERS2 {
            NumAdapters: 0,
            pAdapters: null_mut(),
        };
        // SAFETY: com `pAdapters` nulo a API só informa a quantidade.
        if unsafe { D3DKMTEnumAdapters2(&mut enumerate) } < 0 {
            return None;
        }
        // SAFETY: struct POD.
        let mut adapters: Vec<D3DKMT_ADAPTERINFO> =
            vec![unsafe { zeroed() }; enumerate.NumAdapters as usize];
        enumerate.pAdapters = adapters.as_mut_ptr();
        // SAFETY: `adapters` tem `NumAdapters` posições.
        if unsafe { D3DKMTEnumAdapters2(&mut enumerate) } < 0 {
            return None;
        }
        adapters.truncate(enumerate.NumAdapters as usize);

        let mut gpus = Vec::new();
        for adapter in &adapters {
            let handle = adapter.hAdapter;
            let software = query_adapter::<D3DKMT_ADAPTERTYPE>(handle, KMTQAITYPE_ADAPTERTYPE)
                // SAFETY: leitura do campo inteiro da união.
                .map(|kind| unsafe { kind.Anonymous.Value } & SOFTWARE_DEVICE_BIT != 0);
            let caps = query_adapter::<D3DKMT_WDDM_2_7_CAPS>(handle, KMTQAITYPE_WDDM_2_7_CAPS)
                // SAFETY: leitura (por cópia) do campo inteiro da união.
                .map(|caps| unsafe { caps.Anonymous.Value })
                .unwrap_or(0);
            let name =
                query_adapter::<D3DKMT_ADAPTERREGISTRYINFO>(handle, KMTQAITYPE_ADAPTERREGISTRYINFO)
                    .map(|info| from_wide(&info.AdapterString).trim().to_string())
                    .filter(|name| !name.is_empty());
            // SAFETY: handle aberto por D3DKMTEnumAdapters2, fechado uma vez.
            unsafe { D3DKMTCloseAdapter(&D3DKMT_CLOSEADAPTER { hAdapter: handle }) };

            if software == Some(true) {
                continue;
            }
            gpus.push(RawGpu {
                name: name.unwrap_or_else(|| "Placa de vídeo".into()),
                supported: caps & HAGS_SUPPORTED_BIT != 0,
                enabled: caps & HAGS_ENABLED_BIT != 0,
            });
        }
        Some(gpus)
    }

    /// Valores de uma chave `StartupApproved\…`, pelo nome em minúsculas.
    fn approvals(hive: Hive, kind: &str) -> HashMap<String, Vec<u8>> {
        let path = format!(r"{APPROVED}\{kind}");
        let Ok(Some(key)) = registry::open(hive, &path) else {
            return HashMap::new();
        };
        key.values()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|(name, value)| match value {
                RegValue::Binary(bytes) => Some((name.to_lowercase(), bytes)),
                _ => None,
            })
            .collect()
    }

    fn run_entries(
        location: StartupLocation,
        hive: Hive,
        path: &str,
        approval_kind: &str,
        entries: &mut Vec<RawStartupEntry>,
    ) {
        let Ok(Some(key)) = registry::open(hive, path) else {
            return;
        };
        let approved = approvals(hive, approval_kind);
        let lookup = |name: &str| std::env::var(name).ok();
        for (name, value) in key.values().unwrap_or_default() {
            let command = match value {
                RegValue::Text(text) => text,
                RegValue::ExpandText(text) => expand_env(&text, lookup),
                _ => continue,
            };
            // O valor padrão (sem nome) não é um programa.
            if name.is_empty() {
                continue;
            }
            entries.push(RawStartupEntry {
                location,
                approval: approved.get(&name.to_lowercase()).cloned(),
                target_exists: target_exists(&command, Path::exists),
                command: Some(command),
                name,
            });
        }
    }

    fn folder_entries(
        location: StartupLocation,
        folder: Option<PathBuf>,
        hive: Hive,
        entries: &mut Vec<RawStartupEntry>,
    ) {
        let Some(Ok(listing)) = folder.map(std::fs::read_dir) else {
            return;
        };
        let approved = approvals(hive, "StartupFolder");
        for entry in listing.flatten() {
            let is_file = entry.file_type().is_ok_and(|kind| kind.is_file());
            let name = entry.file_name().to_string_lossy().into_owned();
            if !is_file || name.eq_ignore_ascii_case("desktop.ini") {
                continue;
            }
            entries.push(RawStartupEntry {
                location,
                approval: approved.get(&name.to_lowercase()).cloned(),
                command: None,
                target_exists: None,
                name,
            });
        }
    }

    fn startup_folder(base: &str) -> Option<PathBuf> {
        let base = std::env::var_os(base)?;
        Some(
            STARTUP_FOLDER
                .iter()
                .fold(PathBuf::from(base), |path, part| path.join(part)),
        )
    }

    fn packaged_tasks() -> Option<Vec<RawPackagedTask>> {
        let root = match registry::open(Hive::CurrentUser, PACKAGED_TASKS) {
            Ok(Some(root)) => root,
            Ok(None) => return Some(Vec::new()),
            Err(_) => return None,
        };
        let mut tasks = Vec::new();
        for family in root.subkeys().ok()? {
            let Ok(Some(package)) = root.subkey(&family) else {
                continue;
            };
            for task_id in package.subkeys().unwrap_or_default() {
                let state = package
                    .subkey(&task_id)
                    .ok()
                    .flatten()
                    .and_then(|task| task.dword("State").ok().flatten());
                if let Some(state) = state {
                    tasks.push(RawPackagedTask {
                        package_family: family.clone(),
                        task_id,
                        state,
                    });
                }
            }
        }
        Some(tasks)
    }

    fn startup() -> RawStartup {
        let mut entries = Vec::new();
        run_entries(
            StartupLocation::UserRun,
            Hive::CurrentUser,
            RUN,
            "Run",
            &mut entries,
        );
        run_entries(
            StartupLocation::MachineRun,
            Hive::LocalMachine,
            RUN,
            "Run",
            &mut entries,
        );
        run_entries(
            StartupLocation::MachineRun32,
            Hive::LocalMachine,
            RUN32,
            "Run32",
            &mut entries,
        );
        folder_entries(
            StartupLocation::UserStartupFolder,
            startup_folder("APPDATA"),
            Hive::CurrentUser,
            &mut entries,
        );
        folder_entries(
            StartupLocation::CommonStartupFolder,
            startup_folder("ProgramData"),
            Hive::LocalMachine,
            &mut entries,
        );
        RawStartup {
            entries,
            packaged: packaged_tasks(),
        }
    }

    fn smbios() -> Option<Vec<u8>> {
        // SAFETY: buffer nulo com tamanho 0 só consulta o tamanho.
        let size = unsafe { GetSystemFirmwareTable(RSMB, 0, null_mut(), 0) };
        if size == 0 {
            return None;
        }
        let mut buffer = vec![0u8; size as usize];
        // SAFETY: `buffer` tem `size` bytes.
        let written = unsafe { GetSystemFirmwareTable(RSMB, 0, buffer.as_mut_ptr(), size) };
        if written == 0 || written > size {
            return None;
        }
        buffer.truncate(written as usize);
        Some(buffer)
    }

    fn firmware() -> Option<FirmwareKind> {
        let mut kind = 0;
        // SAFETY: `kind` recebe o tipo do firmware.
        if unsafe { GetFirmwareType(&mut kind) } == 0 {
            return None;
        }
        if kind == FirmwareTypeUefi {
            Some(FirmwareKind::Uefi)
        } else if kind == FirmwareTypeBios {
            Some(FirmwareKind::Legacy)
        } else {
            None
        }
    }

    fn tpm() -> Option<TpmStatus> {
        // SAFETY: struct POD.
        let mut info: TPM_DEVICE_INFO = unsafe { zeroed() };
        info.structVersion = 1;
        // SAFETY: `info` tem o tamanho informado.
        let result = unsafe {
            Tbsi_GetDeviceInfo(
                size_of::<TPM_DEVICE_INFO>() as u32,
                (&mut info as *mut TPM_DEVICE_INFO).cast(),
            )
        };
        if result == TBS_E_TPM_NOT_FOUND as u32 {
            return Some(TpmStatus::NotFound);
        }
        if result != 0 {
            return None;
        }
        match info.tpmVersion {
            TPM_VERSION_12 => Some(TpmStatus::Tpm12),
            TPM_VERSION_20 => Some(TpmStatus::Tpm20),
            _ => None,
        }
    }

    /// Bit 31 do ECX na folha 1 do CPUID: há um hypervisor rodando.
    #[cfg(target_arch = "x86_64")]
    fn hypervisor_present() -> Option<bool> {
        // `__cpuid` passou a ser segura em versões recentes do Rust; o bloco
        // `unsafe` é necessário no `rust-version` do projeto.
        #[allow(unused_unsafe)]
        // SAFETY: a folha 1 existe em todos os processadores x86-64.
        let leaf = unsafe { std::arch::x86_64::__cpuid(1) };
        Some(leaf.ecx & (1 << 31) != 0)
    }

    #[cfg(not(target_arch = "x86_64"))]
    fn hypervisor_present() -> Option<bool> {
        None
    }

    fn memory_integrity() -> Option<bool> {
        let mut info = SYSTEM_CODEINTEGRITY_INFORMATION {
            Length: size_of::<SYSTEM_CODEINTEGRITY_INFORMATION>() as u32,
            CodeIntegrityOptions: 0,
        };
        let mut returned = 0u32;
        // SAFETY: `info` tem o tamanho informado (o campo Length é exigido).
        let status = unsafe {
            NtQuerySystemInformation(
                SystemCodeIntegrityInformation,
                (&mut info as *mut SYSTEM_CODEINTEGRITY_INFORMATION).cast(),
                info.Length,
                &mut returned,
            )
        };
        (status >= 0)
            .then_some(info.CodeIntegrityOptions & CODEINTEGRITY_OPTION_HVCI_KMCI_ENABLED != 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::calendar::CalendarDate;
    use crate::domain::system_settings::{build_windows_report, hardware};

    /// Lê o PC real e imprime só contadores e versões (sem nomes de programas
    /// nem seriais). `cargo test reads_the_real_machine -- --ignored --nocapture`.
    #[test]
    #[ignore = "lê o PC real"]
    fn reads_the_real_machine() {
        let reader = WindowsSettingsReader;
        let settings = build_windows_report(reader.windows_settings());
        println!(
            "planos: {:?} · ativo: {:?}",
            settings.power.as_ref().map(|power| power.plans.len()),
            settings
                .power
                .as_ref()
                .and_then(|power| power.active().map(|plan| plan.kind))
        );
        println!("modo de jogo: {:?}", settings.game_mode);
        println!("gpus: {:?}", settings.gpus);
        println!("reinício pendente: {:?}", settings.pending_reboot);
        println!(
            "inicialização: {} itens ({} desligados), {} da Store",
            settings.startup.items.len(),
            settings
                .startup
                .items
                .iter()
                .filter(|item| item.state
                    == crate::domain::system_settings::startup::StartupState::Disabled)
                .count(),
            settings.startup.packaged.len()
        );
        println!("achados: {:?}", settings.findings);

        let today = CalendarDate::parse("2026-10-16").unwrap();
        let hardware = hardware::build_report(reader.hardware(), today);
        println!(
            "firmware {:?} · secure boot {:?} · tpm {:?} · virtualização {:?} · HVCI {:?}",
            hardware.firmware,
            hardware.secure_boot,
            hardware.tpm,
            hardware.virtualization,
            hardware.memory_integrity
        );
        println!("bios: {:?} · placa: {:?}", hardware.bios, hardware.board);
        println!("cpu: {:?}", hardware.cpu);
        for module in &hardware.memory_modules {
            println!(
                "ram: {:?} {:?} {:?} máx {:?} configurada {:?}",
                module.locator,
                module.kind,
                module.size_bytes,
                module.max_speed_mts,
                module.configured_speed_mts
            );
        }
        println!("achados: {:?}", hardware.findings);
        assert!(hardware.smbios_available);
    }
}
