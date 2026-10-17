//! Lado do app (sem elevação): cria o pipe, abre o próprio executável elevado
//! pelo UAC com `--windows-repair <pipe>` e repassa o andamento.
//!
//! O pipe tem nome aleatório (128 bits), aceita uma conexão só, recusa clientes
//! remotos e tem DACL só para o usuário atual e o SYSTEM. Quem conectar precisa
//! ser exatamente o processo que o UAC abriu (PID conferido); senão o reparo é
//! abortado. Nada é gravado em arquivos de pastas do usuário pelo processo elevado.

use std::mem::{size_of, zeroed};
use std::ptr::{null, null_mut};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::Duration;

use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, LocalFree, ERROR_CANCELLED, ERROR_IO_PENDING, ERROR_PIPE_CONNECTED,
    HANDLE, WAIT_OBJECT_0,
};
use windows_sys::Win32::Security::Authorization::{
    ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
use windows_sys::Win32::Security::Cryptography::{
    BCryptGenRandom, BCRYPT_USE_SYSTEM_PREFERRED_RNG,
};
use windows_sys::Win32::Security::{PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_FLAG_FIRST_PIPE_INSTANCE, FILE_FLAG_OVERLAPPED, PIPE_ACCESS_DUPLEX,
};
use windows_sys::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, GetNamedPipeClientProcessId, PIPE_READMODE_BYTE,
    PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_WAIT,
};
use windows_sys::Win32::System::Threading::{
    CreateEventW, GetProcessId, WaitForMultipleObjects, WaitForSingleObject,
};
use windows_sys::Win32::System::IO::{CancelIoEx, OVERLAPPED};
use windows_sys::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};

use super::pipe::{LineBuffer, OverlappedPipe};
use crate::domain::windows_repair::{
    HelperMessage, LaunchEvent, RepairLauncher, CANCEL_LINE, HELPER_FLAG, PIPE_PREFIX,
};
use crate::error::{AppError, AppResult};
use crate::platform::cleanup::current_user_sid;
use crate::platform::registry::wide;

/// Tempo para o ajudante se conectar depois que o UAC foi aceito.
const CONNECT_TIMEOUT_MS: u32 = 60_000;
/// `SW_HIDE`: o ajudante não tem janela.
const SHOW_HIDDEN: i32 = 0;
/// De quanto em quanto tempo o laço confere o pedido de cancelamento.
const POLL: Duration = Duration::from_millis(200);

pub struct WindowsRepairLauncher;

/// Handle comum; fechado ao sair de escopo.
struct OwnedHandle(HANDLE);

impl Drop for OwnedHandle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            // SAFETY: handle aberto por este módulo e fechado uma vez.
            unsafe { CloseHandle(self.0) };
        }
    }
}

fn device_error(message: &str) -> AppError {
    AppError::Device(message.into())
}

fn random_pipe_name() -> AppResult<String> {
    let mut bytes = [0u8; 16];
    // SAFETY: buffer de 16 bytes; gerador do sistema.
    let status = unsafe {
        BCryptGenRandom(
            null_mut(),
            bytes.as_mut_ptr(),
            bytes.len() as u32,
            BCRYPT_USE_SYSTEM_PREFERRED_RNG,
        )
    };
    if status < 0 {
        return Err(device_error("Não foi possível gerar o canal do reparo."));
    }
    let suffix: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    Ok(format!("{PIPE_PREFIX}{suffix}"))
}

/// Pipe com DACL só para o usuário atual e o SYSTEM.
fn create_pipe(name: &str) -> AppResult<OverlappedPipe> {
    let sid = current_user_sid().ok_or_else(|| device_error("Usuário atual não identificado."))?;
    let sddl = wide(&format!("D:P(A;;GA;;;{sid})(A;;GA;;;SY)"));
    let mut descriptor: PSECURITY_DESCRIPTOR = null_mut();
    // SAFETY: SDDL terminado em nulo; o descritor é liberado com LocalFree.
    if unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            SDDL_REVISION_1,
            &mut descriptor,
            null_mut(),
        )
    } == 0
    {
        return Err(device_error("Não foi possível proteger o canal do reparo."));
    }
    let attributes = SECURITY_ATTRIBUTES {
        nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: descriptor,
        bInheritHandle: 0,
    };
    let path = wide(&format!(r"\\.\pipe\{name}"));
    // SAFETY: nome terminado em nulo; uma instância; atributos válidos.
    let handle = unsafe {
        CreateNamedPipeW(
            path.as_ptr(),
            PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE | FILE_FLAG_OVERLAPPED,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
            1,
            64 * 1024,
            64 * 1024,
            0,
            &attributes,
        )
    };
    // SAFETY: descritor alocado pela conversão acima.
    unsafe { LocalFree(descriptor) };
    OverlappedPipe::from_handle(handle)
        .map_err(|_| device_error("Não foi possível criar o canal do reparo."))
}

/// Abre o executável elevado pelo UAC. `Ok(None)` = o usuário recusou.
fn launch_elevated(pipe_name: &str) -> AppResult<Option<OwnedHandle>> {
    let exe = std::env::current_exe()?;
    let file = wide(&exe.to_string_lossy());
    let verb = wide("runas");
    let parameters = wide(&format!("{HELPER_FLAG} {pipe_name}"));
    // SAFETY: struct POD zerada e preenchida abaixo.
    let mut info: SHELLEXECUTEINFOW = unsafe { zeroed() };
    info.cbSize = size_of::<SHELLEXECUTEINFOW>() as u32;
    info.fMask = SEE_MASK_NOCLOSEPROCESS;
    info.lpVerb = verb.as_ptr();
    info.lpFile = file.as_ptr();
    info.lpParameters = parameters.as_ptr();
    info.nShow = SHOW_HIDDEN;
    // SAFETY: textos terminados em nulo vivos durante a chamada. Bloqueia até o UAC ser respondido.
    if unsafe { ShellExecuteExW(&mut info) } == 0 {
        // SAFETY: lê o erro da chamada acima.
        return match unsafe { GetLastError() } {
            ERROR_CANCELLED => Ok(None),
            code => Err(AppError::Device(format!(
                "O Windows não abriu o reparo (código {code})."
            ))),
        };
    }
    if info.hProcess.is_null() {
        return Err(device_error("O Windows não devolveu o processo do reparo."));
    }
    Ok(Some(OwnedHandle(info.hProcess)))
}

/// Espera o ajudante conectar (ou sair). Confere que é o processo aberto pelo UAC.
fn wait_connection(pipe: &OverlappedPipe, process: &OwnedHandle) -> AppResult<()> {
    // SAFETY: evento sem nome, reset manual.
    let event = OwnedHandle(unsafe { CreateEventW(null(), 1, 0, null()) });
    if event.0.is_null() {
        return Err(device_error("Não foi possível esperar o reparo."));
    }
    // SAFETY: estrutura POD zerada.
    let mut overlapped: OVERLAPPED = unsafe { zeroed() };
    overlapped.hEvent = event.0;
    // SAFETY: `overlapped` vive até a conexão terminar ou ser cancelada abaixo.
    let connected = unsafe { ConnectNamedPipe(pipe.handle(), &mut overlapped) } != 0;
    if !connected {
        // SAFETY: lê o erro da chamada acima.
        match unsafe { GetLastError() } {
            ERROR_PIPE_CONNECTED => {}
            ERROR_IO_PENDING => {
                let handles = [event.0, process.0];
                // SAFETY: os dois handles são válidos.
                let waited =
                    unsafe { WaitForMultipleObjects(2, handles.as_ptr(), 0, CONNECT_TIMEOUT_MS) };
                if waited != WAIT_OBJECT_0 {
                    // SAFETY: cancela a conexão pendente deste `overlapped` antes de ele sair de escopo.
                    unsafe {
                        CancelIoEx(pipe.handle(), &overlapped);
                        WaitForSingleObject(event.0, 1_000);
                    }
                    return Err(device_error(
                        "O reparo elevado não respondeu. Nada foi feito.",
                    ));
                }
            }
            code => {
                return Err(AppError::Device(format!(
                    "Falha ao esperar o reparo (código {code})."
                )))
            }
        }
    }
    let mut client = 0u32;
    // SAFETY: pipe conectado; `client` recebe o PID do outro lado.
    let ok = unsafe { GetNamedPipeClientProcessId(pipe.handle(), &mut client) } != 0;
    // SAFETY: handle do processo aberto pelo ShellExecuteExW.
    let expected = unsafe { GetProcessId(process.0) };
    if !ok || client == 0 || client != expected {
        return Err(device_error(
            "Outro programa tentou se conectar ao reparo. Por segurança, nada foi feito.",
        ));
    }
    Ok(())
}

impl RepairLauncher for WindowsRepairLauncher {
    fn run(&self, on_event: &mut dyn FnMut(LaunchEvent), cancel: &AtomicBool) -> AppResult<()> {
        let name = random_pipe_name()?;
        let pipe = create_pipe(&name)?;
        let Some(process) = launch_elevated(&name)? else {
            return Err(AppError::Validation(
                "A permissão de administrador foi recusada. Nada foi feito.".into(),
            ));
        };
        wait_connection(&pipe, &process)?;
        on_event(LaunchEvent::Connected);

        let pipe = Arc::new(pipe);
        let (sender, receiver) = mpsc::channel::<HelperMessage>();
        let reader = {
            let pipe = Arc::clone(&pipe);
            thread::spawn(move || {
                let mut lines = LineBuffer::default();
                let mut chunk = [0u8; 4096];
                // Termina quando o ajudante fecha o pipe (fim ou queda).
                while let Ok(read) = pipe.read(&mut chunk) {
                    for line in lines.push(&chunk[..read]) {
                        if let Some(message) = HelperMessage::parse_line(&line) {
                            if sender.send(message).is_err() {
                                return;
                            }
                        }
                    }
                }
            })
        };

        let mut cancel_sent = false;
        loop {
            match receiver.recv_timeout(POLL) {
                Ok(message) => on_event(LaunchEvent::Message(message)),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
            if !cancel_sent && cancel.load(Ordering::SeqCst) {
                cancel_sent = true;
                // Ajudante já saindo: não há o que cancelar.
                let _ = pipe.write_all(format!("{CANCEL_LINE}\n").as_bytes());
            }
        }
        let _ = reader.join();
        // SAFETY: handle do processo; espera curta pela saída.
        unsafe { WaitForSingleObject(process.0, 5_000) };
        Ok(())
    }
}
