//! Acesso ao sistema operacional — SOMENTE LEITURA, com uma exceção.
//!
//! Único lugar que consulta o SO (assim como `repositories` é o único com SQL).
//! Nenhuma função aqui encerra processos ou pede elevação. A única que altera
//! o sistema é `cleanup_executor` (remoção da limpeza confirmada pelo usuário,
//! separada da análise em `cleanup`).

pub mod cleanup;
pub mod cleanup_executor;
pub mod devices;
pub mod system_monitor;
