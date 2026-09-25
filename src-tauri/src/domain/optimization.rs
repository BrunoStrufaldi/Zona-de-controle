//! Otimização segura (Fase 4) — SOMENTE CONTRATOS.
//!
//! Nenhuma operação de limpeza ou exclusão existe nesta fase. Quando for
//! implementada, a execução destrutiva será um trait SEPARADO da análise e
//! deverá obrigatoriamente:
//! - receber um plano previamente aprovado pelo usuário (confirmação explícita);
//! - atuar apenas em locais de uma allowlist, nunca em arquivos críticos;
//! - registrar cada execução no `audit_log`;
//! - suportar cancelamento quando possível;
//! - nunca executar comandos shell arbitrários nem pedir elevação de privilégio.

use serde::Serialize;

use crate::error::AppResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CleanupCategoryId {
    TempFiles,
    SafeCaches,
    RecycleBin,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CleanupRisk {
    Low,
    Medium,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CleanupCategoryStatus {
    Planned,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupCategoryDescriptor {
    pub id: CleanupCategoryId,
    pub name: &'static str,
    pub description: &'static str,
    pub risk: CleanupRisk,
    pub requires_confirmation: bool,
    pub status: CleanupCategoryStatus,
}

/// Resultado de uma análise somente leitura (nada é removido).
#[allow(dead_code)] // Contrato da Fase 4.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupScanResult {
    pub category_id: CleanupCategoryId,
    pub item_count: u64,
    pub total_bytes: u64,
    pub sample_items: Vec<String>,
}

/// Analisa uma categoria e lista candidatos — SOMENTE LEITURA.
#[allow(dead_code)] // Contrato da Fase 4; ainda sem implementações.
pub trait CleanupAnalyzer: Send + Sync {
    fn category(&self) -> CleanupCategoryId;
    fn analyze(&self) -> AppResult<CleanupScanResult>;
}

/// Categorias previstas. Todas exigem confirmação explícita.
pub fn planned_categories() -> Vec<CleanupCategoryDescriptor> {
    vec![
        CleanupCategoryDescriptor {
            id: CleanupCategoryId::TempFiles,
            name: "Arquivos temporários",
            description: "Arquivos na pasta temporária do usuário que não estão em uso.",
            risk: CleanupRisk::Low,
            requires_confirmation: true,
            status: CleanupCategoryStatus::Planned,
        },
        CleanupCategoryDescriptor {
            id: CleanupCategoryId::SafeCaches,
            name: "Caches seguros",
            description: "Somente caches explicitamente conhecidos como seguros para remover.",
            risk: CleanupRisk::Low,
            requires_confirmation: true,
            status: CleanupCategoryStatus::Planned,
        },
        CleanupCategoryDescriptor {
            id: CleanupCategoryId::RecycleBin,
            name: "Lixeira",
            description: "Itens que já estão na Lixeira do Windows.",
            risk: CleanupRisk::Medium,
            requires_confirmation: true,
            status: CleanupCategoryStatus::Planned,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_category_requires_confirmation() {
        assert!(planned_categories()
            .iter()
            .all(|category| category.requires_confirmation));
    }
}
