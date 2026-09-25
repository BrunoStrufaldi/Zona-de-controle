//! Repositórios: único lugar com SQL. Funções recebem uma `Connection` (ou
//! `Transaction`) para que os serviços controlem as transações.

pub mod audit;
pub mod backup;
pub mod clock;
pub mod notes;
pub mod routines;
pub mod settings;
pub mod task_categories;
pub mod tasks;
