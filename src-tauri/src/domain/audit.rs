//! Vocabulário do log de auditoria.
//!
//! Toda operação sensível (alteração de configuração hoje; limpeza de arquivos
//! e operações financeiras no futuro) deve gerar um registro de auditoria.

/// Área do app que originou o evento. Adicione variantes ao criar novos módulos.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuditCategory {
    Settings,
    Tasks,
    Notes,
    Routines,
    Calendar,
    Devices,
    Optimization,
    Finance,
    Database,
    /// Atualização do próprio app.
    App,
}

impl AuditCategory {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Settings => "settings",
            Self::Tasks => "tasks",
            Self::Notes => "notes",
            Self::Routines => "routines",
            Self::Calendar => "calendar",
            Self::Devices => "devices",
            Self::Optimization => "optimization",
            Self::Finance => "finance",
            Self::Database => "database",
            Self::App => "app",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuditOutcome {
    Success,
    Failure,
    /// Interrompida pelo usuário no meio (ex.: limpeza cancelada).
    Cancelled,
}

impl AuditOutcome {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Success => "success",
            Self::Failure => "failure",
            Self::Cancelled => "cancelled",
        }
    }
}

/// Dados de um novo registro de auditoria.
#[derive(Debug, Clone)]
pub struct NewAuditEntry<'a> {
    pub category: AuditCategory,
    /// Ação em notação `recurso.verbo` (ex.: `setting.updated`).
    pub action: &'a str,
    pub target: Option<&'a str>,
    pub outcome: AuditOutcome,
    pub details: Option<serde_json::Value>,
}
