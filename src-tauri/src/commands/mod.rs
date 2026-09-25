//! Camada IPC: os únicos pontos de entrada chamáveis pelo frontend.
//!
//! Regras:
//! - Commands são finos: validam o formato da entrada e delegam para `services`.
//! - Cada command precisa estar listado em `build.rs` e permitido em
//!   `capabilities/default.toml` (menor privilégio).
//! - Leitura e operações destrutivas NUNCA ficam no mesmo command.

pub mod app;
pub mod audit;
pub mod backup;
pub mod devices;
pub mod notes;
pub mod optimization;
pub mod routines;
pub mod settings;
pub mod tasks;
