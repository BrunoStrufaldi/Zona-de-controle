//! Reparo do Windows (4.7) — EXCEÇÃO MÍNIMA às regras "sem shell" e "sem
//! administrador", aprovada pelo usuário.
//!
//! - `launcher` (app, sem elevação): pede a elevação pelo UAC **a cada reparo**
//!   e abre o próprio executável com `--windows-repair <pipe>`.
//! - `helper` (elevado): roda só a sequência fixa do domínio
//!   (`domain::windows_repair`): DISM pela API (`dism`) e `System32\sfc.exe
//!   /scannow` (`sfc`), nada mais. Sem Tauri, sem banco, sem argumentos da tela.
//! - `pipe`: canal com I/O sobreposto entre os dois.
//!
//! Fora do Windows o reparo não existe.

#[cfg(windows)]
mod dism;
#[cfg(windows)]
mod helper;
#[cfg(windows)]
mod launcher;
#[cfg(windows)]
mod pipe;
#[cfg(windows)]
mod sfc;

#[cfg(windows)]
pub use launcher::WindowsRepairLauncher;

#[cfg(not(windows))]
pub struct WindowsRepairLauncher;

#[cfg(not(windows))]
impl crate::domain::windows_repair::RepairLauncher for WindowsRepairLauncher {
    fn run(
        &self,
        _on_event: &mut dyn FnMut(crate::domain::windows_repair::LaunchEvent),
        _cancel: &std::sync::atomic::AtomicBool,
    ) -> crate::error::AppResult<()> {
        Err(crate::error::AppError::Device(
            "O reparo só existe no Windows.".into(),
        ))
    }
}

/// Modo ajudante (processo elevado). Devolve o código de saída.
pub fn run_helper(pipe_name: &str) -> i32 {
    #[cfg(windows)]
    {
        helper::run(pipe_name)
    }
    #[cfg(not(windows))]
    {
        let _ = pipe_name;
        1
    }
}

/// O DISM e o SFC deste Windows estão no lugar? (só confere os arquivos)
pub fn tools_available() -> bool {
    #[cfg(windows)]
    {
        sfc::system_directory()
            .is_some_and(|dir| dir.join("DismApi.dll").is_file() && dir.join("sfc.exe").is_file())
    }
    #[cfg(not(windows))]
    {
        false
    }
}
