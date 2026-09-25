//! Backups do banco local: nomes de arquivo e contrato com o frontend.
//! Espelhado em `src/types/backup.ts`.

use serde::Serialize;

/// Prefixo e extensão dos arquivos de backup. Só arquivos neste formato são
/// listados — nada fora dele é tocado na pasta de backups.
pub const FILE_PREFIX: &str = "zona-de-controle-";
pub const FILE_EXTENSION: &str = ".db";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub file_name: String,
    pub path: String,
    pub size_bytes: u64,
    /// Data/hora local do backup (`aaaa-mm-ddThh:mm:ss`, sem fuso), lida do nome.
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupOverview {
    pub directory: String,
    /// Mais recentes primeiro.
    pub backups: Vec<BackupFile>,
}

/// Nome do arquivo para um instante local `aaaa-mm-dd_hhmmss`; `attempt` > 0
/// acrescenta um sufixo quando já existe um backup no mesmo segundo.
pub fn file_name_for(timestamp: &str, attempt: u32) -> String {
    if attempt == 0 {
        format!("{FILE_PREFIX}{timestamp}{FILE_EXTENSION}")
    } else {
        format!("{FILE_PREFIX}{timestamp}-{attempt}{FILE_EXTENSION}")
    }
}

/// Extrai a data/hora de um nome gerado por [`file_name_for`]. Retorna `None`
/// para qualquer arquivo que não seja um backup do app.
pub fn parse_created_at(file_name: &str) -> Option<String> {
    let stem = file_name
        .strip_prefix(FILE_PREFIX)?
        .strip_suffix(FILE_EXTENSION)?;
    // aaaa-mm-dd_hhmmss (17 caracteres), com sufixo opcional "-N".
    let (timestamp, suffix) = stem.split_at_checked(17)?;
    if !(suffix.is_empty()
        || suffix
            .strip_prefix('-')
            .is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit())))
    {
        return None;
    }
    let bytes = timestamp.as_bytes();
    let digits_at = |range: std::ops::Range<usize>| bytes[range].iter().all(u8::is_ascii_digit);
    let well_formed = bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes[10] == b'_'
        && digits_at(0..4)
        && digits_at(5..7)
        && digits_at(8..10)
        && digits_at(11..17);
    well_formed.then(|| {
        format!(
            "{}T{}:{}:{}",
            &timestamp[0..10],
            &timestamp[11..13],
            &timestamp[13..15],
            &timestamp[15..17]
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_and_parses_file_names() {
        let name = file_name_for("2026-09-25_143005", 0);
        assert_eq!(name, "zona-de-controle-2026-09-25_143005.db");
        assert_eq!(
            parse_created_at(&name).as_deref(),
            Some("2026-09-25T14:30:05")
        );

        let retry = file_name_for("2026-09-25_143005", 2);
        assert_eq!(retry, "zona-de-controle-2026-09-25_143005-2.db");
        assert!(parse_created_at(&retry).is_some());
    }

    #[test]
    fn ignores_other_files() {
        for name in [
            "zona-de-controle.db",
            "zona-de-controle-2026-09-25_143005.db-wal",
            "outro-2026-09-25_143005.db",
            "zona-de-controle-2026-09-25_1430.db",
            "zona-de-controle-2026-09-25_143005-x.db",
            "notas.txt",
        ] {
            assert!(parse_created_at(name).is_none(), "{name}");
        }
    }
}
