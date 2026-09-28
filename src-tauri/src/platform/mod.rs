//! Acesso ao sistema operacional — SOMENTE LEITURA.
//!
//! Único lugar que consulta o SO (assim como `repositories` é o único com SQL).
//! Nenhuma função aqui altera o sistema, encerra processos ou pede elevação.

pub mod cleanup;
pub mod devices;
pub mod system_monitor;
