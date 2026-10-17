//! Lado elevado do reparo: o próprio executável aberto com `--windows-repair`.
//!
//! Não inicia o Tauri, não abre o banco e não aceita instruções além do nome do
//! pipe. Antes de qualquer coisa confere que está elevado e que o outro lado do
//! pipe é o próprio app (mesmo executável). Roda a sequência fixa do domínio e
//! avisa o andamento. Se o app fechar (pipe quebrado), cancela a DISM e não
//! começa o próximo passo (decisão do usuário); o SFC já iniciado vai até o fim.

use std::path::{Path, PathBuf};
use std::ptr::{null, null_mut};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use windows_sys::Win32::Foundation::{CloseHandle, GENERIC_READ, GENERIC_WRITE, HANDLE};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_FLAG_OVERLAPPED, OPEN_EXISTING, SECURITY_IDENTIFICATION,
    SECURITY_SQOS_PRESENT,
};
use windows_sys::Win32::System::Pipes::GetNamedPipeServerProcessId;
use windows_sys::Win32::System::Threading::{
    CreateEventW, OpenProcess, QueryFullProcessImageNameW, SetEvent, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION,
};

use super::dism::{Dism, DismError};
use super::pipe::{LineBuffer, OverlappedPipe};
use super::sfc;
use crate::domain::windows_repair::{
    error_kind, is_reboot_required, next_step, restore_needed, HelperMessage, RepairStep,
    StepResult, CANCEL_LINE,
};
use crate::platform::cleanup::is_elevated;
use crate::platform::registry::{from_wide, wide};

/// Códigos de saída do ajudante (só diagnóstico; o resultado vai pelo pipe).
const EXIT_OK: i32 = 0;
const EXIT_NOT_ELEVATED: i32 = 2;
const EXIT_PIPE: i32 = 3;
const EXIT_UNTRUSTED_SERVER: i32 = 4;

/// Evento de cancelamento da DISM (reset manual); fechado ao sair de escopo.
struct CancelEvent(HANDLE);

// SAFETY: um handle de evento pode ser sinalizado de qualquer thread.
unsafe impl Send for CancelEvent {}
// SAFETY: idem.
unsafe impl Sync for CancelEvent {}

impl Drop for CancelEvent {
    fn drop(&mut self) {
        // SAFETY: criado em `run` e fechado uma vez.
        unsafe { CloseHandle(self.0) };
    }
}

/// Caminho completo do executável de um processo.
fn process_image(pid: u32) -> Option<PathBuf> {
    // SAFETY: só consulta; o handle é fechado abaixo.
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if process.is_null() {
        return None;
    }
    let mut buffer = vec![0u16; 1024];
    let mut size = buffer.len() as u32;
    // SAFETY: o tamanho informado é o do buffer.
    let ok = unsafe {
        QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, buffer.as_mut_ptr(), &mut size)
    };
    // SAFETY: handle aberto acima.
    unsafe { CloseHandle(process) };
    (ok != 0).then(|| PathBuf::from(from_wide(&buffer[..size as usize])))
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a.as_os_str().eq_ignore_ascii_case(b.as_os_str()),
        _ => false,
    }
}

/// O servidor do pipe é este mesmo executável (o app que pediu o reparo)?
fn trusted_server(pipe: &OverlappedPipe) -> bool {
    let mut pid = 0u32;
    // SAFETY: handle de pipe válido; `pid` recebe o processo servidor.
    if unsafe { GetNamedPipeServerProcessId(pipe.handle(), &mut pid) } == 0 {
        return false;
    }
    match (process_image(pid), std::env::current_exe()) {
        (Some(server), Ok(own)) => same_file(&server, &own),
        _ => false,
    }
}

fn connect(name: &str) -> Option<OverlappedPipe> {
    let path = wide(&format!(r"\\.\pipe\{name}"));
    // SAFETY: caminho terminado em nulo. SECURITY_IDENTIFICATION: o servidor
    // não consegue agir em nome deste processo elevado.
    let handle = unsafe {
        CreateFileW(
            path.as_ptr(),
            GENERIC_READ | GENERIC_WRITE,
            0,
            null(),
            OPEN_EXISTING,
            FILE_FLAG_OVERLAPPED | SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION,
            null_mut(),
        )
    };
    OverlappedPipe::from_handle(handle).ok()
}

fn failed(error: &DismError) -> StepResult {
    if error.cancelled() {
        return StepResult::Cancelled;
    }
    StepResult::Failed {
        code: (error.code != 0).then_some(error.code),
        kind: error_kind(error.code),
        detail: error.message.clone(),
    }
}

/// Ponto de entrada do modo ajudante. Devolve o código de saída do processo.
pub fn run(pipe_name: &str) -> i32 {
    if !is_elevated() {
        return EXIT_NOT_ELEVATED;
    }
    let Some(pipe) = connect(pipe_name) else {
        return EXIT_PIPE;
    };
    if !trusted_server(&pipe) {
        return EXIT_UNTRUSTED_SERVER;
    }
    let pipe = Arc::new(pipe);
    let writer = Mutex::new(Arc::clone(&pipe));
    let send = |message: HelperMessage| {
        if let Ok(pipe) = writer.lock() {
            // Sem o app do outro lado não há a quem avisar; a sequência segue a regra do cancelamento.
            let _ = pipe.write_all(message.to_line().as_bytes());
        }
    };

    // SAFETY: evento sem nome, reset manual, começa não sinalizado.
    let event = unsafe { CreateEventW(null(), 1, 0, null()) };
    if event.is_null() {
        send(HelperMessage::Error {
            message: "Não foi possível preparar o cancelamento.".into(),
        });
        return EXIT_PIPE;
    }
    let cancel_event = Arc::new(CancelEvent(event));
    let cancelled = Arc::new(AtomicBool::new(false));

    // Escuta o app: "cancel" ou pipe fechado (app fechado) cancelam.
    {
        let pipe = Arc::clone(&pipe);
        let cancel_event = Arc::clone(&cancel_event);
        let cancelled = Arc::clone(&cancelled);
        thread::spawn(move || {
            let mut lines = LineBuffer::default();
            let mut chunk = [0u8; 256];
            loop {
                let stop = match pipe.read(&mut chunk) {
                    Ok(read) => lines
                        .push(&chunk[..read])
                        .iter()
                        .any(|line| line.trim() == CANCEL_LINE),
                    Err(_) => true,
                };
                if stop {
                    cancelled.store(true, Ordering::SeqCst);
                    // SAFETY: evento válido enquanto o Arc existir.
                    unsafe { SetEvent(cancel_event.0) };
                    return;
                }
            }
        });
    }

    let dism = match Dism::open() {
        Ok(dism) => dism,
        Err(error) => {
            send(HelperMessage::Error {
                message: if error.message.is_empty() {
                    format!("A DISM não pôde ser iniciada (0x{:08X}).", error.code)
                } else {
                    error.message
                },
            });
            return EXIT_OK;
        }
    };

    let mut done: Vec<(RepairStep, StepResult)> = Vec::new();
    while let Some(step) = next_step(&done) {
        if cancelled.load(Ordering::SeqCst) {
            send(HelperMessage::StepFinished {
                step,
                result: StepResult::Cancelled,
            });
            done.push((step, StepResult::Cancelled));
            break;
        }
        if step == RepairStep::RestoreHealth && !restore_needed(&done) {
            send(HelperMessage::StepFinished {
                step,
                result: StepResult::Skipped,
            });
            done.push((step, StepResult::Skipped));
            continue;
        }
        send(HelperMessage::StepStarted { step });
        let report = |percent: f32| send(HelperMessage::Progress { step, percent });
        let result = match step {
            RepairStep::CheckHealth | RepairStep::ScanHealth => dism
                .check_health(step == RepairStep::ScanHealth, cancel_event.0, &report)
                .map_or_else(
                    |error| failed(&error),
                    |health| StepResult::Health { health },
                ),
            RepairStep::RestoreHealth => dism.restore_health(cancel_event.0, &report).map_or_else(
                |error| failed(&error),
                |code| StepResult::Restored {
                    restart_required: is_reboot_required(code),
                },
            ),
            RepairStep::Sfc => sfc::run(&report),
        };
        send(HelperMessage::StepFinished {
            step,
            result: result.clone(),
        });
        done.push((step, result));
    }
    drop(dism);
    send(HelperMessage::Finished);
    EXIT_OK
}
