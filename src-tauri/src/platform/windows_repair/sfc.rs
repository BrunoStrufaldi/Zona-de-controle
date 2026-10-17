//! `sfc /scannow`, usado só pelo ajudante elevado.
//!
//! O SFC não tem API: roda `System32\sfc.exe` pelo **caminho absoluto**, com o
//! argumento fixo `/scannow`, sem shell e sem janela. O percentual vem da saída
//! do console (traduzida; só os números importam) e o resultado, das linhas
//! `[SR]` que esta execução gravou no `CBS.log` (o log não é traduzido).
//! Uma vez iniciado, o SFC vai até o fim: interrompê-lo no meio não é seguro.

use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom};
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use windows_sys::Win32::Storage::FileSystem::{
    FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
};
use windows_sys::Win32::System::SystemInformation::GetSystemDirectoryW;
use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;

use crate::domain::windows_repair::{
    decode_console, parse_cbs_log, parse_sfc_percent, RepairErrorKind, SfcOutcome, StepResult,
};
use crate::platform::registry::from_wide;

/// Lê no máximo isto do `CBS.log` (a parte desta execução fica no fim).
const MAX_LOG_BYTES: u64 = 64 * 1024 * 1024;
/// Guarda o fim da saída do console para achar o último percentual.
const CONSOLE_TAIL: usize = 4096;

/// `C:\Windows\System32`, pelo Windows (nunca pelo PATH).
pub fn system_directory() -> Option<PathBuf> {
    let mut buffer = vec![0u16; 512];
    // SAFETY: o tamanho informado é o do buffer.
    let length = unsafe { GetSystemDirectoryW(buffer.as_mut_ptr(), buffer.len() as u32) } as usize;
    (length > 0 && length < buffer.len()).then(|| PathBuf::from(from_wide(&buffer[..length])))
}

fn cbs_log() -> Option<PathBuf> {
    Some(system_directory()?.parent()?.join(r"Logs\CBS\CBS.log"))
}

fn log_length() -> u64 {
    cbs_log()
        .and_then(|path| fs::metadata(path).ok())
        .map_or(0, |metadata| metadata.len())
}

/// O trecho do `CBS.log` gravado depois de `start` (o Windows mantém o
/// arquivo aberto: abre compartilhando leitura, escrita e exclusão).
fn read_log_since(start: u64) -> Option<String> {
    let mut file = OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .open(cbs_log()?)
        .ok()?;
    let length = file.metadata().ok()?.len();
    // Arquivo menor que no início = o Windows arquivou o log; lê o novo inteiro.
    let from = if length >= start { start } else { 0 };
    let from = from.max(length.saturating_sub(MAX_LOG_BYTES));
    file.seek(SeekFrom::Start(from)).ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

fn failure(error: &std::io::Error) -> StepResult {
    StepResult::Failed {
        code: error.raw_os_error().map(|code| code as u32),
        kind: RepairErrorKind::Other,
        detail: error.to_string(),
    }
}

pub fn run(report: &dyn Fn(f32)) -> StepResult {
    let Some(sfc) = system_directory().map(|dir| dir.join("sfc.exe")) else {
        return StepResult::Failed {
            code: None,
            kind: RepairErrorKind::Other,
            detail: "Pasta do sistema não encontrada.".into(),
        };
    };
    let start = log_length();
    let mut child = match Command::new(&sfc)
        .arg("/scannow")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
    {
        Ok(child) => child,
        Err(error) => return failure(&error),
    };

    if let Some(mut stdout) = child.stdout.take() {
        let mut tail: Vec<u8> = Vec::new();
        let mut chunk = [0u8; 1024];
        let mut last = None;
        while let Ok(read) = stdout.read(&mut chunk) {
            if read == 0 {
                break;
            }
            tail.extend_from_slice(&chunk[..read]);
            if tail.len() > CONSOLE_TAIL {
                // Mantém um número par de bytes descartados (UTF-16).
                let cut = (tail.len() - CONSOLE_TAIL) & !1;
                tail.drain(..cut);
            }
            let percent = parse_sfc_percent(&decode_console(&tail));
            if percent.is_some() && percent != last {
                last = percent;
                report(f32::from(percent.unwrap_or_default()));
            }
        }
    }
    if let Err(error) = child.wait() {
        return failure(&error);
    }

    let outcome = read_log_since(start).map_or(SfcOutcome::Unknown, |log| parse_cbs_log(&log));
    StepResult::Sfc { outcome }
}
