//! Casos de uso: orquestram domínio, repositórios, transações e auditoria.
//! Os commands (camada IPC) apenas delegam para cá.

pub mod backup;
pub mod calendar;
pub mod devices;
pub mod diagnostics;
pub mod finance;
pub mod finance_import;
pub mod finance_installments;
pub mod finance_recurring;
pub mod notes;
pub mod optimization;
pub mod routines;
pub mod settings;
pub mod task_categories;
pub mod tasks;
