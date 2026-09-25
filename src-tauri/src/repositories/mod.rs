//! Repositórios: único lugar com SQL. Funções recebem uma `Connection` (ou
//! `Transaction`) para que os serviços controlem as transações.

pub mod audit;
pub mod backup;
pub mod notes;
pub mod settings;
pub mod task_categories;
pub mod tasks;
