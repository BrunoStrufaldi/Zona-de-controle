//! Repositórios: único lugar com SQL. Funções recebem uma `Connection` (ou
//! `Transaction`) para que os serviços controlem as transações.

pub mod audit;
pub mod settings;
pub mod tasks;
