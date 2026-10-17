//! Named pipe com I/O sobreposto, usado pelos dois lados do reparo.
//!
//! O handle é aberto com `FILE_FLAG_OVERLAPPED`: assim uma leitura parada
//! esperando dados não bloqueia uma escrita de outra thread (com handle
//! síncrono as duas se serializariam e o cancelamento nunca chegaria).

use std::io;
use std::mem::zeroed;
use std::ptr::{null, null_mut};

use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, ERROR_IO_PENDING, HANDLE, INVALID_HANDLE_VALUE,
};
use windows_sys::Win32::Storage::FileSystem::{ReadFile, WriteFile};
use windows_sys::Win32::System::Threading::CreateEventW;
use windows_sys::Win32::System::IO::{GetOverlappedResult, OVERLAPPED};

/// Handle do pipe; fechado ao sair de escopo.
pub struct OverlappedPipe(HANDLE);

// SAFETY: o handle de pipe pode ser usado por várias threads; cada operação
// tem a própria estrutura OVERLAPPED e o próprio evento.
unsafe impl Send for OverlappedPipe {}
// SAFETY: idem.
unsafe impl Sync for OverlappedPipe {}

/// Evento de uma operação; fechado ao sair de escopo.
struct Event(HANDLE);

impl Event {
    fn new() -> io::Result<Self> {
        // SAFETY: evento sem nome, reset manual, começa não sinalizado.
        let handle = unsafe { CreateEventW(null(), 1, 0, null()) };
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }
        Ok(Self(handle))
    }
}

impl Drop for Event {
    fn drop(&mut self) {
        // SAFETY: handle criado em `new` e fechado uma vez.
        unsafe { CloseHandle(self.0) };
    }
}

impl OverlappedPipe {
    /// Assume um handle aberto com `FILE_FLAG_OVERLAPPED`.
    pub fn from_handle(handle: HANDLE) -> io::Result<Self> {
        if handle.is_null() || handle == INVALID_HANDLE_VALUE {
            return Err(io::Error::last_os_error());
        }
        Ok(Self(handle))
    }

    pub fn handle(&self) -> HANDLE {
        self.0
    }

    /// Espera o fim de uma operação iniciada com `overlapped`.
    fn finish(&self, started: bool, overlapped: &OVERLAPPED) -> io::Result<usize> {
        if !started {
            // SAFETY: lê o erro da chamada que acabou de falhar.
            let error = unsafe { GetLastError() };
            if error != ERROR_IO_PENDING {
                return Err(io::Error::from_raw_os_error(error as i32));
            }
        }
        let mut transferred = 0u32;
        // SAFETY: `overlapped` pertence a esta operação e vive até aqui.
        if unsafe { GetOverlappedResult(self.0, overlapped, &mut transferred, 1) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(transferred as usize)
    }

    /// Lê o que chegar (bloqueia até haver dados). `Ok(0)` não acontece:
    /// pipe fechado do outro lado vira erro (`ERROR_BROKEN_PIPE`).
    pub fn read(&self, buffer: &mut [u8]) -> io::Result<usize> {
        let event = Event::new()?;
        // SAFETY: estrutura POD zerada.
        let mut overlapped: OVERLAPPED = unsafe { zeroed() };
        overlapped.hEvent = event.0;
        // SAFETY: `buffer` e `overlapped` vivem até `finish` terminar.
        let started = unsafe {
            ReadFile(
                self.0,
                buffer.as_mut_ptr(),
                buffer.len() as u32,
                null_mut(),
                &mut overlapped,
            )
        } != 0;
        self.finish(started, &overlapped)
    }

    pub fn write_all(&self, mut data: &[u8]) -> io::Result<()> {
        while !data.is_empty() {
            let event = Event::new()?;
            // SAFETY: estrutura POD zerada.
            let mut overlapped: OVERLAPPED = unsafe { zeroed() };
            overlapped.hEvent = event.0;
            // SAFETY: `data` e `overlapped` vivem até `finish` terminar.
            let started = unsafe {
                WriteFile(
                    self.0,
                    data.as_ptr(),
                    data.len() as u32,
                    null_mut(),
                    &mut overlapped,
                )
            } != 0;
            let written = self.finish(started, &overlapped)?;
            if written == 0 {
                return Err(io::Error::new(io::ErrorKind::WriteZero, "pipe fechado"));
            }
            data = &data[written..];
        }
        Ok(())
    }
}

impl Drop for OverlappedPipe {
    fn drop(&mut self) {
        // SAFETY: handle recebido em `from_handle` e fechado uma vez.
        unsafe { CloseHandle(self.0) };
    }
}

/// Junta pedaços lidos e devolve as linhas completas (sem o `\n`).
#[derive(Default)]
pub struct LineBuffer {
    pending: Vec<u8>,
}

/// Limite de uma linha: mensagens do protocolo são pequenas.
const MAX_LINE: usize = 64 * 1024;

impl LineBuffer {
    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.pending.extend_from_slice(chunk);
        let mut lines = Vec::new();
        while let Some(position) = self.pending.iter().position(|byte| *byte == b'\n') {
            let line: Vec<u8> = self.pending.drain(..=position).collect();
            lines.push(String::from_utf8_lossy(&line[..line.len() - 1]).into_owned());
        }
        if self.pending.len() > MAX_LINE {
            // Lixo sem fim de linha: descarta em vez de crescer sem limite.
            self.pending.clear();
        }
        lines
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_lines_across_chunks() {
        let mut buffer = LineBuffer::default();
        assert!(buffer.push(b"{\"a\":").is_empty());
        assert_eq!(
            buffer.push(b"1}\n{\"b\":2}\nresto"),
            ["{\"a\":1}", "{\"b\":2}"]
        );
        assert_eq!(buffer.push(b"\n"), ["resto"]);
        assert!(buffer.push(&vec![b'x'; MAX_LINE + 1]).is_empty());
        assert!(buffer.pending.is_empty());
    }
}
