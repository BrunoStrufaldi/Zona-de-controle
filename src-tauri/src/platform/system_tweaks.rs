//! Ajustes reversíveis do Windows (4.6) — ESCREVE no sistema, sem administrador.
//!
//! Segunda exceção de escrita de `platform` (a primeira é `cleanup_executor`).
//! Só três lugares, todos do usuário atual:
//! - plano de energia ativo (`PowerSetActiveScheme`, só planos que existem);
//! - `HKCU\Software\Microsoft\GameBar\AutoGameModeEnabled` (Modo de Jogo);
//! - `HKCU\…\Explorer\StartupApproved\{Run,StartupFolder}\<programa>`, o mesmo
//!   valor que o Gerenciador de Tarefas grava. O `Run` e as pastas Inicializar
//!   nunca são alterados.
//!
//! Quem decide o que gravar é `services::system_tweaks` (validação, valor
//! anterior, auditoria). Fora do Windows tudo falha com "não disponível".

use crate::domain::system_settings::power::RawPowerPlan;
use crate::domain::system_settings::startup::StartupLocation;
use crate::domain::system_tweaks::{SystemTweaker, TweakTarget, TweakValue};
use crate::error::{AppError, AppResult};

pub struct WindowsTweaker;

impl SystemTweaker for WindowsTweaker {
    fn power_plans(&self) -> AppResult<Vec<RawPowerPlan>> {
        imp::power_plans()
    }

    fn read(&self, target: &TweakTarget) -> AppResult<TweakValue> {
        imp::read(target)
    }

    fn write(&self, target: &TweakTarget, value: &TweakValue) -> AppResult<()> {
        imp::write(target, value)
    }

    fn startup_exists(&self, location: StartupLocation, name: &str) -> AppResult<bool> {
        imp::startup_exists(location, name)
    }
}

#[cfg(not(windows))]
mod imp {
    use super::*;

    fn unavailable<T>() -> AppResult<T> {
        Err(AppError::Device("Disponível só no Windows.".into()))
    }

    pub fn power_plans() -> AppResult<Vec<RawPowerPlan>> {
        unavailable()
    }

    pub fn read(_target: &TweakTarget) -> AppResult<TweakValue> {
        unavailable()
    }

    pub fn write(_target: &TweakTarget, _value: &TweakValue) -> AppResult<()> {
        unavailable()
    }

    pub fn startup_exists(_location: StartupLocation, _name: &str) -> AppResult<bool> {
        unavailable()
    }
}

#[cfg(windows)]
mod imp {
    use std::ptr::{null, null_mut};

    use windows_sys::core::GUID;
    use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS, WIN32_ERROR};
    use windows_sys::Win32::System::Power::PowerSetActiveScheme;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegDeleteKeyValueW, RegSetValueExW, HKEY, HKEY_CURRENT_USER,
        KEY_SET_VALUE, REG_BINARY, REG_DWORD, REG_OPTION_NON_VOLATILE,
    };

    use super::*;
    use crate::domain::system_settings::power::parse_guid;
    use crate::domain::system_tweaks::from_hex;
    use crate::platform::registry::{self, wide, Hive, RegValue};
    use crate::platform::system_settings::{read_power, startup_folder, APPROVED, GAME_BAR, RUN};

    const GAME_MODE_VALUE: &str = "AutoGameModeEnabled";

    fn device_error(message: &str, code: WIN32_ERROR) -> AppError {
        AppError::Device(format!("{message} (código {code})."))
    }

    /// Subchave do `StartupApproved` de cada local editável.
    fn approval_path(location: StartupLocation) -> AppResult<String> {
        let kind = match location {
            StartupLocation::UserRun => "Run",
            StartupLocation::UserStartupFolder => "StartupFolder",
            _ => {
                return Err(AppError::Validation(
                    "Este programa é da máquina e não pode ser alterado pelo app.".into(),
                ))
            }
        };
        Ok(format!(r"{APPROVED}\{kind}"))
    }

    pub fn power_plans() -> AppResult<Vec<RawPowerPlan>> {
        read_power()
            .map(|power| power.plans)
            .ok_or_else(|| AppError::Device("Não foi possível ler os planos de energia.".into()))
    }

    pub fn read(target: &TweakTarget) -> AppResult<TweakValue> {
        match target {
            TweakTarget::ActivePowerPlan => {
                let power = read_power().ok_or_else(|| {
                    AppError::Device("Não foi possível ler o plano de energia ativo.".into())
                })?;
                let guid = power.active_guid.ok_or_else(|| {
                    AppError::Device("Não foi possível ler o plano de energia ativo.".into())
                })?;
                let name = power
                    .plans
                    .into_iter()
                    .find(|plan| plan.guid.eq_ignore_ascii_case(&guid))
                    .map_or_else(|| guid.clone(), |plan| plan.name);
                Ok(TweakValue::PowerPlan { guid, name })
            }
            TweakTarget::GameMode => {
                let value = match registry::open(Hive::CurrentUser, GAME_BAR) {
                    Ok(None) => None,
                    Ok(Some(key)) => key.dword(GAME_MODE_VALUE).map_err(|code| {
                        device_error("Não foi possível ler o Modo de Jogo", code)
                    })?,
                    Err(code) => {
                        return Err(device_error("Não foi possível ler o Modo de Jogo", code))
                    }
                };
                Ok(TweakValue::GameMode { value })
            }
            TweakTarget::Startup { location, name } => {
                let read_error = |code| {
                    device_error(&format!("Não foi possível ler o estado de “{name}”"), code)
                };
                let bytes = match registry::open(Hive::CurrentUser, &approval_path(*location)?) {
                    Ok(None) => None,
                    Ok(Some(key)) => key.binary(name).map_err(read_error)?,
                    Err(code) => return Err(read_error(code)),
                };
                TweakValue::startup_from(bytes.as_deref()).ok_or_else(|| {
                    AppError::Validation(format!(
                        "O estado de “{name}” está num formato desconhecido; o app não mexe."
                    ))
                })
            }
        }
    }

    /// Abre (ou cria) a chave do usuário só para gravar valores.
    fn create_key(path: &str) -> AppResult<HKEY> {
        let path_w = wide(path);
        let mut key: HKEY = null_mut();
        // SAFETY: `path_w` termina em nulo; `key` recebe o handle, fechado por quem chama.
        let result = unsafe {
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                path_w.as_ptr(),
                0,
                null(),
                REG_OPTION_NON_VOLATILE,
                KEY_SET_VALUE,
                null(),
                &mut key,
                null_mut(),
            )
        };
        if result != ERROR_SUCCESS {
            return Err(device_error("O Windows recusou a gravação", result));
        }
        Ok(key)
    }

    fn set_value(path: &str, name: &str, kind: u32, data: &[u8]) -> AppResult<()> {
        let key = create_key(path)?;
        let name_w = wide(name);
        // SAFETY: `key` foi aberta acima; `data` tem o tamanho informado.
        let result = unsafe {
            RegSetValueExW(
                key,
                name_w.as_ptr(),
                0,
                kind,
                data.as_ptr(),
                data.len() as u32,
            )
        };
        // SAFETY: fecha a chave aberta por `create_key`.
        unsafe { RegCloseKey(key) };
        if result != ERROR_SUCCESS {
            return Err(device_error("O Windows recusou a gravação", result));
        }
        Ok(())
    }

    /// Volta ao "sem valor" (padrão do Windows). Já ausente não é erro.
    fn delete_value(path: &str, name: &str) -> AppResult<()> {
        let path_w = wide(path);
        let name_w = wide(name);
        // SAFETY: os dois textos terminam em nulo.
        let result =
            unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, path_w.as_ptr(), name_w.as_ptr()) };
        if result != ERROR_SUCCESS && result != ERROR_FILE_NOT_FOUND {
            return Err(device_error("O Windows recusou a gravação", result));
        }
        Ok(())
    }

    pub fn write(target: &TweakTarget, value: &TweakValue) -> AppResult<()> {
        match (target, value) {
            (TweakTarget::ActivePowerPlan, TweakValue::PowerPlan { guid, .. }) => {
                let (data1, data2, data3, data4) = parse_guid(guid).ok_or_else(|| {
                    AppError::Validation("Identificador de plano de energia inválido.".into())
                })?;
                let guid = GUID {
                    data1,
                    data2,
                    data3,
                    data4,
                };
                // SAFETY: `guid` é um GUID válido durante a chamada.
                let result = unsafe { PowerSetActiveScheme(null_mut(), &guid) };
                if result != ERROR_SUCCESS {
                    return Err(device_error(
                        "O Windows recusou trocar o plano de energia",
                        result,
                    ));
                }
                Ok(())
            }
            (TweakTarget::GameMode, TweakValue::GameMode { value }) => match value {
                Some(value) => {
                    set_value(GAME_BAR, GAME_MODE_VALUE, REG_DWORD, &value.to_le_bytes())
                }
                None => delete_value(GAME_BAR, GAME_MODE_VALUE),
            },
            (
                TweakTarget::Startup { location, name },
                TweakValue::StartupApproval { bytes, .. },
            ) => {
                let path = approval_path(*location)?;
                match bytes {
                    Some(hex) => {
                        let data = from_hex(hex).ok_or_else(|| {
                            AppError::Validation("Valor de inicialização inválido.".into())
                        })?;
                        set_value(&path, name, REG_BINARY, &data)
                    }
                    None => delete_value(&path, name),
                }
            }
            _ => Err(AppError::Validation(
                "Valor incompatível com o ajuste.".into(),
            )),
        }
    }

    pub fn startup_exists(location: StartupLocation, name: &str) -> AppResult<bool> {
        match location {
            StartupLocation::UserRun => {
                let key = match registry::open(Hive::CurrentUser, RUN) {
                    Ok(Some(key)) => key,
                    Ok(None) => return Ok(false),
                    Err(code) => {
                        return Err(device_error("Não foi possível ler a inicialização", code))
                    }
                };
                let values = key
                    .values()
                    .map_err(|code| device_error("Não foi possível ler a inicialização", code))?;
                Ok(values.iter().any(|(value_name, value)| {
                    value_name.eq_ignore_ascii_case(name)
                        && matches!(value, RegValue::Text(_) | RegValue::ExpandText(_))
                }))
            }
            StartupLocation::UserStartupFolder => Ok(startup_folder("APPDATA")
                .map(|folder| folder.join(name))
                .is_some_and(|path| path.is_file())),
            _ => Ok(false),
        }
    }
}
