//! DISM pela API (`DismApi.dll`), usada só pelo ajudante elevado.
//!
//! A DLL é carregada **só de System32** (`LOAD_LIBRARY_SEARCH_SYSTEM32`), para
//! nenhuma cópia em outra pasta ser usada no lugar, e não existe no
//! `windows-sys`: as poucas funções usadas são buscadas pelo nome. A API dá o
//! estado da imagem estruturado (sem ler o texto traduzido do `dism.exe`),
//! progresso e cancelamento por evento.

use std::ffi::c_void;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::ptr::{null, null_mut};

use windows_sys::Win32::Foundation::{FreeLibrary, HANDLE, HMODULE};
use windows_sys::Win32::System::LibraryLoader::{
    GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_SYSTEM32,
};

use crate::domain::windows_repair::{ImageHealth, HRESULT_CANCELLED};
use crate::platform::registry::{from_wide, wide};

/// Imagem do Windows em execução (`DISM_ONLINE_IMAGE`).
const ONLINE_IMAGE: &str = "DISM_{53BFAE52-B167-4E2F-A258-0A37B57FF845}";
/// `DismLogErrorsWarnings`: o log padrão fica em `%WINDIR%\Logs\DISM\dism.log`.
const LOG_ERRORS_WARNINGS: i32 = 1;

type ProgressCallback = unsafe extern "system" fn(current: u32, total: u32, user_data: *mut c_void);
type InitializeFn = unsafe extern "system" fn(i32, *const u16, *const u16) -> i32;
type OpenSessionFn = unsafe extern "system" fn(*const u16, *const u16, *const u16, *mut u32) -> i32;
type CheckHealthFn = unsafe extern "system" fn(
    u32,
    i32,
    HANDLE,
    Option<ProgressCallback>,
    *mut c_void,
    *mut i32,
) -> i32;
type RestoreHealthFn = unsafe extern "system" fn(
    u32,
    *const *const u16,
    u32,
    i32,
    HANDLE,
    Option<ProgressCallback>,
    *mut c_void,
) -> i32;
type CloseSessionFn = unsafe extern "system" fn(u32) -> i32;
type ShutdownFn = unsafe extern "system" fn() -> i32;
type LastErrorFn = unsafe extern "system" fn(*mut *mut DismString) -> i32;
type DeleteFn = unsafe extern "system" fn(*const c_void) -> i32;

#[repr(C)]
struct DismString {
    value: *const u16,
}

/// Falha da DISM: o HRESULT e a mensagem que ela deu.
#[derive(Debug)]
pub struct DismError {
    pub code: u32,
    pub message: String,
}

impl DismError {
    pub fn cancelled(&self) -> bool {
        self.code == HRESULT_CANCELLED
    }
}

/// Sessão aberta na imagem do Windows em execução.
pub struct Dism {
    library: HMODULE,
    session: u32,
    check_health: CheckHealthFn,
    restore_health: RestoreHealthFn,
    close_session: CloseSessionFn,
    shutdown: ShutdownFn,
    last_error: LastErrorFn,
    delete: DeleteFn,
}

/// Recebe o andamento (0–100) do passo em curso.
struct ProgressSink<'a> {
    report: &'a dyn Fn(f32),
}

unsafe extern "system" fn on_progress(current: u32, total: u32, user_data: *mut c_void) {
    if user_data.is_null() || total == 0 {
        return;
    }
    // SAFETY: `user_data` aponta para o `ProgressSink` vivo durante a chamada da DISM.
    let sink = unsafe { &*(user_data as *const ProgressSink<'_>) };
    let percent = (f64::from(current) * 100.0 / f64::from(total)) as f32;
    // Pânico não pode atravessar a fronteira com a DLL.
    let _ = catch_unwind(AssertUnwindSafe(|| (sink.report)(percent)));
}

/// Busca uma função exportada e a converte para o tipo esperado.
///
/// # Safety
/// `T` precisa ser o tipo de ponteiro de função correspondente à exportação.
unsafe fn symbol<T: Copy>(library: HMODULE, name: &[u8]) -> Option<T> {
    // SAFETY: `name` termina em nulo.
    let address = unsafe { GetProcAddress(library, name.as_ptr()) }?;
    // SAFETY: o chamador garante o tipo; ponteiros de função têm o mesmo tamanho.
    Some(unsafe { std::mem::transmute_copy(&address) })
}

impl Dism {
    /// Carrega a DLL, inicializa e abre a sessão online.
    pub fn open() -> Result<Self, DismError> {
        let unavailable = |message: &str| DismError {
            code: 0,
            message: message.into(),
        };
        let name = wide("DismApi.dll");
        // SAFETY: nome terminado em nulo; busca restrita a System32.
        let library =
            unsafe { LoadLibraryExW(name.as_ptr(), null_mut(), LOAD_LIBRARY_SEARCH_SYSTEM32) };
        if library.is_null() {
            return Err(unavailable("DismApi.dll não encontrada em System32."));
        }
        // SAFETY: os tipos seguem o DismApi.h.
        let loaded = unsafe {
            (
                symbol::<InitializeFn>(library, b"DismInitialize\0"),
                symbol::<OpenSessionFn>(library, b"DismOpenSession\0"),
                symbol::<CheckHealthFn>(library, b"DismCheckImageHealth\0"),
                symbol::<RestoreHealthFn>(library, b"DismRestoreImageHealth\0"),
                symbol::<CloseSessionFn>(library, b"DismCloseSession\0"),
                symbol::<ShutdownFn>(library, b"DismShutdown\0"),
                symbol::<LastErrorFn>(library, b"DismGetLastErrorMessage\0"),
                symbol::<DeleteFn>(library, b"DismDelete\0"),
            )
        };
        let (
            Some(initialize),
            Some(open_session),
            Some(check_health),
            Some(restore_health),
            Some(close_session),
            Some(shutdown),
            Some(last_error),
            Some(delete),
        ) = loaded
        else {
            // SAFETY: biblioteca carregada acima, não usada depois.
            unsafe { FreeLibrary(library) };
            return Err(unavailable(
                "A DismApi.dll deste Windows não tem as funções esperadas.",
            ));
        };

        let mut dism = Self {
            library,
            session: 0,
            check_health,
            restore_health,
            close_session,
            shutdown,
            last_error,
            delete,
        };
        // SAFETY: log e pasta temporária padrão (nulos).
        let result = unsafe { initialize(LOG_ERRORS_WARNINGS, null(), null()) };
        if result < 0 {
            let error = dism.error(result);
            // SAFETY: biblioteca carregada acima; nada foi inicializado.
            unsafe { FreeLibrary(dism.library) };
            dism.library = null_mut();
            return Err(error);
        }
        let image = wide(ONLINE_IMAGE);
        let mut session = 0u32;
        // SAFETY: imagem online; pastas padrão (nulas).
        let result = unsafe { open_session(image.as_ptr(), null(), null(), &mut session) };
        if result < 0 {
            return Err(dism.error(result));
        }
        dism.session = session;
        Ok(dism)
    }

    /// Erro com a mensagem que a DISM guardou.
    fn error(&self, code: i32) -> DismError {
        let mut message: *mut DismString = null_mut();
        // SAFETY: a DISM aloca a mensagem; liberada com DismDelete.
        let text = if unsafe { (self.last_error)(&mut message) } >= 0 && !message.is_null() {
            // SAFETY: `message` aponta para uma DismString válida até o DismDelete.
            let value = unsafe { (*message).value };
            let text = if value.is_null() {
                String::new()
            } else {
                // SAFETY: texto terminado em nulo da DISM.
                let length = (0..).take_while(|&i| unsafe { *value.add(i) } != 0).count();
                // SAFETY: `length` unidades válidas a partir de `value`.
                from_wide(unsafe { std::slice::from_raw_parts(value, length) })
            };
            // SAFETY: estrutura alocada pela própria DISM.
            unsafe { (self.delete)(message.cast()) };
            text
        } else {
            String::new()
        };
        DismError {
            code: code as u32,
            message: text.trim().to_string(),
        }
    }

    /// CheckHealth (`scan = false`) ou ScanHealth (`scan = true`).
    pub fn check_health(
        &self,
        scan: bool,
        cancel_event: HANDLE,
        report: &dyn Fn(f32),
    ) -> Result<ImageHealth, DismError> {
        let sink = ProgressSink { report };
        let mut state = -1i32;
        // SAFETY: `sink` vive até o fim da chamada; `state` recebe o resultado.
        let result = unsafe {
            (self.check_health)(
                self.session,
                i32::from(scan),
                cancel_event,
                Some(on_progress),
                (&sink as *const ProgressSink<'_>).cast_mut().cast(),
                &mut state,
            )
        };
        if result < 0 {
            return Err(self.error(result));
        }
        ImageHealth::from_code(state).ok_or(DismError {
            code: 0,
            message: format!("Estado da imagem desconhecido: {state}."),
        })
    }

    /// RestoreHealth pelo Windows Update (sem fontes próprias). Devolve o código
    /// de sucesso (3010 = reinício necessário).
    pub fn restore_health(
        &self,
        cancel_event: HANDLE,
        report: &dyn Fn(f32),
    ) -> Result<u32, DismError> {
        let sink = ProgressSink { report };
        // SAFETY: sem fontes (lista nula, 0); `sink` vive até o fim da chamada.
        let result = unsafe {
            (self.restore_health)(
                self.session,
                null(),
                0,
                0,
                cancel_event,
                Some(on_progress),
                (&sink as *const ProgressSink<'_>).cast_mut().cast(),
            )
        };
        if result < 0 {
            return Err(self.error(result));
        }
        Ok(result as u32)
    }
}

impl Drop for Dism {
    fn drop(&mut self) {
        if self.library.is_null() {
            return;
        }
        // SAFETY: sessão e biblioteca abertas em `open`, fechadas uma vez.
        unsafe {
            if self.session != 0 {
                (self.close_session)(self.session);
            }
            (self.shutdown)();
            FreeLibrary(self.library);
        }
    }
}
