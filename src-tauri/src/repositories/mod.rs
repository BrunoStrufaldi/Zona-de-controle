//! Repositórios: único lugar com SQL. Funções recebem uma `Connection` (ou
//! `Transaction`) para que os serviços controlem as transações.

pub mod activity;
pub mod audit;
pub mod backup;
pub mod calendar_events;
pub mod cleanup_history;
pub mod clock;
pub mod device_battery_readings;
pub mod device_markings;
pub mod finance_accounts;
pub mod finance_categories;
pub mod finance_import_rules;
pub mod finance_recurring;
pub mod finance_transactions;
pub mod investments;
pub mod notes;
pub mod routines;
pub mod settings;
pub mod task_categories;
pub mod tasks;
pub mod weekly_plan;
