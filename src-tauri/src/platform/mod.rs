//! Acesso ao sistema operacional — SOMENTE LEITURA, com duas exceções.
//!
//! Único lugar que consulta o SO (assim como `repositories` é o único com SQL).
//! Nenhuma função aqui encerra processos ou pede elevação. Só dois módulos
//! alteram o sistema, sempre depois da confirmação do usuário e separados da
//! leitura: `cleanup_executor` (remoção da limpeza; análise em `cleanup`) e
//! `system_tweaks` (ajustes reversíveis do usuário; leitura em `system_settings`).

pub mod cleanup;
pub mod cleanup_executor;
pub mod devices;
pub mod disk_usage;
#[cfg(windows)]
pub mod registry;
pub mod system_monitor;
pub mod system_settings;
pub mod system_tweaks;
pub mod windows_repair;
