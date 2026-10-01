//! Camada IPC: os únicos pontos de entrada chamáveis pelo frontend.
//!
//! Regras:
//! - Commands são finos: validam o formato da entrada e delegam para `services`.
//! - Cada command precisa estar listado em `build.rs` e permitido em
//!   `capabilities/default.toml` (menor privilégio).
//! - Leitura e operações destrutivas NUNCA ficam no mesmo command.

pub mod activity;
pub mod app;
pub mod app_update;
pub mod audit;
pub mod backup;
pub mod calendar;
pub mod devices;
pub mod diagnostics;
pub mod disk_usage;
pub mod finance;
pub mod investments;
pub mod notes;
pub mod optimization;
pub mod routines;
pub mod settings;
pub mod system;
pub mod tasks;
pub mod weekly_plan;
