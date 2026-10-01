//! Atualização do app: contratos do andamento, textos da auditoria e a detecção
//! de versão nova ao abrir.
//!
//! A busca e a instalação (rede, assinatura, instalador) são do
//! `tauri-plugin-updater`, usado só pelo Rust: a janela não tem permissão do
//! plugin e o endereço das versões é fixo no `tauri.conf.json`.

use serde::Serialize;

/// Instalação de uma versão nova: sucesso = baixada, assinatura conferida e
/// instalador aberto (o app fecha em seguida); falha em qualquer etapa.
pub const UPDATE_INSTALL_ACTION: &str = "app.update_install";
/// Primeira abertura depois de mudar de versão.
pub const UPDATED_ACTION: &str = "app.updated";
/// Versão da última abertura (chave reservada: só o próprio app grava).
pub const INSTALLED_VERSION_SETTING_KEY: &str = "app.installed_version";
/// Tamanho máximo das novidades exibidas (o texto vem da versão publicada).
pub const MAX_NOTES_CHARS: usize = 4_000;

/// Versão nova encontrada na busca.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableUpdate {
    pub current_version: String,
    pub version: String,
    /// Novidades da versão (texto simples), se houver.
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum UpdateStage {
    /// Cópia do banco antes de qualquer outra coisa.
    Backup,
    /// Baixando o instalador (a assinatura é conferida no fim).
    Downloading,
    /// Instalador aberto; o app fecha e abre de novo sozinho.
    Installing,
}

impl UpdateStage {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Backup => "backup",
            Self::Downloading => "downloading",
            Self::Installing => "installing",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    pub stage: UpdateStage,
    pub downloaded_bytes: u64,
    /// Tamanho informado pelo servidor; `None` quando ele não informa.
    pub total_bytes: Option<u64>,
}

/// Novidades limpas: sem espaços nas pontas, vazio = nenhuma, e cortadas em
/// `MAX_NOTES_CHARS` caracteres.
pub fn release_notes(body: Option<&str>) -> Option<String> {
    let text = body?.trim();
    if text.is_empty() {
        return None;
    }
    if text.chars().count() <= MAX_NOTES_CHARS {
        return Some(text.to_owned());
    }
    let cut: String = text.chars().take(MAX_NOTES_CHARS).collect();
    Some(format!("{}…", cut.trim_end()))
}

/// Versão anterior se o app mudou de versão desde a última abertura. Na
/// primeira abertura (nada salvo) não há o que comparar.
pub fn version_change(saved: Option<&str>, current: &str) -> Option<String> {
    saved
        .filter(|previous| *previous != current)
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notes_are_trimmed_and_empty_means_none() {
        assert_eq!(release_notes(None), None);
        assert_eq!(release_notes(Some("  \n ")), None);
        assert_eq!(
            release_notes(Some("\n- Planejamento semanal\n")),
            Some("- Planejamento semanal".into())
        );
    }

    #[test]
    fn long_notes_are_cut_by_characters() {
        let long = "ç".repeat(MAX_NOTES_CHARS + 10);
        let notes = release_notes(Some(&long)).unwrap();
        assert_eq!(notes.chars().count(), MAX_NOTES_CHARS + 1);
        assert!(notes.ends_with('…'));
    }

    #[test]
    fn detects_a_version_change_only_when_something_was_saved() {
        assert_eq!(version_change(None, "0.2.0"), None);
        assert_eq!(version_change(Some("0.2.0"), "0.2.0"), None);
        assert_eq!(version_change(Some("0.1.0"), "0.2.0"), Some("0.1.0".into()));
    }

    #[test]
    fn progress_serializes_for_the_frontend() {
        let progress = UpdateProgress {
            stage: UpdateStage::Downloading,
            downloaded_bytes: 10,
            total_bytes: None,
        };
        assert_eq!(
            serde_json::to_value(progress).unwrap(),
            serde_json::json!({ "stage": "downloading", "downloadedBytes": 10, "totalBytes": null })
        );
    }
}
