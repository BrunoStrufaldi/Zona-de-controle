//! Otimização segura (Fase 4): regras puras da limpeza.
//!
//! 4.1 — ANÁLISE (somente leitura). Aqui ficam a allowlist de locais, a regra
//! de idade dos temporários, o leitor dos registros `$I` da Lixeira e o resumo
//! de cada origem. A leitura do disco fica em `platform::cleanup`; nada aqui
//! (nem lá) remove arquivos.
//!
//! A execução (4.2) será um trait e um command SEPARADOS que:
//! - recebem o plano aprovado pelo usuário (confirmação explícita);
//! - só apagam itens da análise, conferidos de novo na hora (ainda na allowlist,
//!   sem links, mesmo tamanho e data);
//! - registram cada execução, com sucesso ou falha, no `audit_log`;
//! - permitem cancelar entre arquivos e nunca pedem administrador nem rodam shell.

use std::collections::HashSet;
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};

use crate::error::AppResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CleanupCategoryId {
    TempFiles,
    SafeCaches,
    RecycleBin,
}

/// Origem analisada: um local (ou família de locais) da allowlist.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CleanupSource {
    UserTemp,
    DirectXShaders,
    NvidiaShaders,
    AmdShaders,
    ErrorReports,
    CrashDumps,
    Thumbnails,
    Chrome,
    Edge,
    Brave,
    Firefox,
    RecycleBin,
}

/// Idade mínima de um temporário para entrar na limpeza (protege instaladores
/// e programas que ainda usam o arquivo).
pub const TEMP_MIN_AGE: Duration = Duration::from_secs(24 * 60 * 60);

/// Pasta-base do usuário. Nunca pastas do sistema (Windows, Program Files).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KnownRoot {
    /// AppData\Local.
    LocalAppData,
    /// AppData\LocalLow (onde drivers recentes da NVIDIA guardam os shaders).
    LocalAppDataLow,
}

/// Quais arquivos de uma pasta entram.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileFilter {
    /// Todos os arquivos da pasta e das subpastas.
    Everything,
    /// Só os arquivos diretos da pasta com o prefixo e o final dados
    /// (sem diferenciar maiúsculas).
    Named {
        prefix: &'static str,
        suffix: &'static str,
    },
}

impl FileFilter {
    pub fn recursive(self) -> bool {
        matches!(self, Self::Everything)
    }

    pub fn matches(self, file_name: &str) -> bool {
        match self {
            Self::Everything => true,
            Self::Named { prefix, suffix } => {
                let name = file_name.to_lowercase();
                name.starts_with(prefix) && name.ends_with(suffix)
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FolderRule {
    pub root: KnownRoot,
    pub path: &'static [&'static str],
    pub filter: FileFilter,
}

impl FolderRule {
    const fn everything(root: KnownRoot, path: &'static [&'static str]) -> Self {
        Self {
            root,
            path,
            filter: FileFilter::Everything,
        }
    }
}

/// Onde ficam os arquivos de uma origem.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceLayout {
    Folders(&'static [FolderRule]),
    /// Navegador Chromium: caches de cada perfil e os compartilhados da pasta
    /// `User Data` (em AppData\Local). Cookies, senhas e histórico não entram.
    Chromium {
        user_data: &'static [&'static str],
    },
    /// Firefox: a pasta `cache2` de cada perfil em AppData\Local (os dados do
    /// perfil ficam em AppData\Roaming e não entram).
    Firefox {
        profiles: &'static [&'static str],
    },
    /// Lixeira do usuário atual em cada unidade fixa.
    RecycleBin,
}

/// Uma subpasta de `User Data` é um perfil quando tem este arquivo.
pub const CHROMIUM_PROFILE_MARKER: &str = "Preferences";
/// Caches de cada perfil: HTTP, código JavaScript compilado e GPU.
pub const CHROMIUM_PROFILE_CACHES: [&str; 3] = ["Cache", "Code Cache", "GPUCache"];
/// Caches de shaders compartilhados entre os perfis.
pub const CHROMIUM_SHARED_CACHES: [&str; 3] = ["ShaderCache", "GrShaderCache", "GraphiteDawnCache"];
pub const FIREFOX_CACHE: &str = "cache2";

use KnownRoot::{LocalAppData, LocalAppDataLow};

const TEMP_FOLDERS: &[FolderRule] = &[FolderRule::everything(LocalAppData, &["Temp"])];
const DIRECTX_FOLDERS: &[FolderRule] = &[FolderRule::everything(LocalAppData, &["D3DSCache"])];
const NVIDIA_FOLDERS: &[FolderRule] = &[
    FolderRule::everything(LocalAppData, &["NVIDIA", "DXCache"]),
    FolderRule::everything(LocalAppData, &["NVIDIA", "GLCache"]),
    FolderRule::everything(LocalAppDataLow, &["NVIDIA", "PerDriverVersion", "DXCache"]),
    FolderRule::everything(LocalAppDataLow, &["NVIDIA", "PerDriverVersion", "GLCache"]),
];
const AMD_FOLDERS: &[FolderRule] = &[
    FolderRule::everything(LocalAppData, &["AMD", "DxCache"]),
    FolderRule::everything(LocalAppData, &["AMD", "DxcCache"]),
    FolderRule::everything(LocalAppData, &["AMD", "GLCache"]),
    FolderRule::everything(LocalAppData, &["AMD", "VkCache"]),
];
const ERROR_REPORT_FOLDERS: &[FolderRule] = &[
    FolderRule::everything(
        LocalAppData,
        &["Microsoft", "Windows", "WER", "ReportArchive"],
    ),
    FolderRule::everything(
        LocalAppData,
        &["Microsoft", "Windows", "WER", "ReportQueue"],
    ),
];
const CRASH_DUMP_FOLDERS: &[FolderRule] = &[FolderRule {
    root: LocalAppData,
    path: &["CrashDumps"],
    filter: FileFilter::Named {
        prefix: "",
        suffix: ".dmp",
    },
}];
const THUMBNAIL_FOLDERS: &[FolderRule] = &[FolderRule {
    root: LocalAppData,
    path: &["Microsoft", "Windows", "Explorer"],
    filter: FileFilter::Named {
        prefix: "thumbcache_",
        suffix: ".db",
    },
}];

impl CleanupSource {
    pub const ALL: [Self; 12] = [
        Self::UserTemp,
        Self::DirectXShaders,
        Self::NvidiaShaders,
        Self::AmdShaders,
        Self::ErrorReports,
        Self::CrashDumps,
        Self::Thumbnails,
        Self::Chrome,
        Self::Edge,
        Self::Brave,
        Self::Firefox,
        Self::RecycleBin,
    ];

    pub fn category(self) -> CleanupCategoryId {
        match self {
            Self::UserTemp => CleanupCategoryId::TempFiles,
            Self::RecycleBin => CleanupCategoryId::RecycleBin,
            _ => CleanupCategoryId::SafeCaches,
        }
    }

    /// Programa dono do cache. Com ele aberto a origem fica bloqueada: apagar o
    /// cache de um navegador em uso pode deixá-lo inconsistente.
    pub fn owner_process(self) -> Option<&'static str> {
        match self {
            Self::Chrome => Some("chrome.exe"),
            Self::Edge => Some("msedge.exe"),
            Self::Brave => Some("brave.exe"),
            Self::Firefox => Some("firefox.exe"),
            _ => None,
        }
    }

    /// Arquivos mais novos que isso ficam de fora (só nos temporários).
    pub fn min_age(self) -> Option<Duration> {
        match self {
            Self::UserTemp => Some(TEMP_MIN_AGE),
            _ => None,
        }
    }

    pub fn layout(self) -> SourceLayout {
        match self {
            Self::UserTemp => SourceLayout::Folders(TEMP_FOLDERS),
            Self::DirectXShaders => SourceLayout::Folders(DIRECTX_FOLDERS),
            Self::NvidiaShaders => SourceLayout::Folders(NVIDIA_FOLDERS),
            Self::AmdShaders => SourceLayout::Folders(AMD_FOLDERS),
            Self::ErrorReports => SourceLayout::Folders(ERROR_REPORT_FOLDERS),
            Self::CrashDumps => SourceLayout::Folders(CRASH_DUMP_FOLDERS),
            Self::Thumbnails => SourceLayout::Folders(THUMBNAIL_FOLDERS),
            Self::Chrome => SourceLayout::Chromium {
                user_data: &["Google", "Chrome", "User Data"],
            },
            Self::Edge => SourceLayout::Chromium {
                user_data: &["Microsoft", "Edge", "User Data"],
            },
            Self::Brave => SourceLayout::Chromium {
                user_data: &["BraveSoftware", "Brave-Browser", "User Data"],
            },
            Self::Firefox => SourceLayout::Firefox {
                profiles: &["Mozilla", "Firefox", "Profiles"],
            },
            Self::RecycleBin => SourceLayout::RecycleBin,
        }
    }
}

/// Recente = criado ou modificado há menos de `min_age`. Vale o mais novo dos
/// dois: arquivos extraídos por um instalador mantêm a data de modificação do
/// pacote, mas a de criação é a da extração. Sem nenhuma data (ou com data no
/// futuro), o arquivo é tratado como recente.
pub fn is_recent(
    created: Option<SystemTime>,
    modified: Option<SystemTime>,
    now: SystemTime,
    min_age: Duration,
) -> bool {
    let Some(newest) = created.into_iter().chain(modified).max() else {
        return true;
    };
    match now.duration_since(newest) {
        Ok(age) => age < min_age,
        Err(_) => true,
    }
}

/// Candidato à limpeza. Na Lixeira, `path` é o local original e `date_ms` a
/// data da exclusão; nas demais origens, a data de modificação.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupItem {
    pub path: String,
    pub bytes: u64,
    /// Milissegundos desde a época Unix.
    pub date_ms: Option<i64>,
}

/// Leitura bruta de uma origem, antes do resumo.
#[derive(Debug, Clone, PartialEq)]
pub struct ScannedSource {
    pub source: CleanupSource,
    /// Pastas encontradas e lidas.
    pub folders: Vec<String>,
    pub items: Vec<CleanupItem>,
    /// Arquivos que ficaram de fora por serem recentes.
    pub recent_count: u64,
    pub recent_bytes: u64,
    /// Entradas ignoradas: links, junções, arquivos só na nuvem ou sem acesso.
    pub ignored_count: u64,
}

impl ScannedSource {
    pub fn new(source: CleanupSource) -> Self {
        Self {
            source,
            folders: Vec::new(),
            items: Vec::new(),
            recent_count: 0,
            recent_bytes: 0,
            ignored_count: 0,
        }
    }
}

/// Lê os locais da allowlist e lista os candidatos — SOMENTE LEITURA. A
/// remoção (4.2) será um trait separado.
pub trait CleanupAnalyzer: Send + Sync {
    /// Uma entrada por origem, na ordem de `CleanupSource::ALL`.
    fn analyze(&self) -> AppResult<Vec<ScannedSource>>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceStatus {
    /// Pode ser limpa (mesmo que esteja vazia).
    Ready,
    /// Nenhuma pasta desta origem existe neste computador.
    NotFound,
    /// O programa dono do cache está aberto; é preciso fechá-lo para limpar.
    InUse,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSummary {
    pub source: CleanupSource,
    pub category: CleanupCategoryId,
    pub status: SourceStatus,
    pub folders: Vec<String>,
    pub item_count: u64,
    pub total_bytes: u64,
    pub recent_count: u64,
    pub recent_bytes: u64,
    pub ignored_count: u64,
}

/// Resultado da análise enviado à tela. Os itens ficam guardados no Rust e são
/// listados por página (`CleanupItemPage`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupScan {
    pub id: u64,
    pub temp_min_age_hours: u64,
    pub sources: Vec<SourceSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupItemPage {
    pub items: Vec<CleanupItem>,
    pub total: usize,
}

/// Maior página aceita na listagem de itens.
pub const ITEM_PAGE_MAX: usize = 200;

/// Resume uma origem. `running` tem os nomes dos processos abertos, em
/// minúsculas.
pub fn summarize(scanned: &ScannedSource, running: &HashSet<String>) -> SourceSummary {
    let source = scanned.source;
    let status = if scanned.folders.is_empty() {
        SourceStatus::NotFound
    } else if source
        .owner_process()
        .is_some_and(|process| running.contains(process))
    {
        SourceStatus::InUse
    } else {
        SourceStatus::Ready
    };
    SourceSummary {
        source,
        category: source.category(),
        status,
        folders: scanned.folders.clone(),
        item_count: scanned.items.len() as u64,
        total_bytes: scanned.items.iter().map(|item| item.bytes).sum(),
        recent_count: scanned.recent_count,
        recent_bytes: scanned.recent_bytes,
        ignored_count: scanned.ignored_count,
    }
}

/// Maiores primeiro; empate pelo caminho, para a ordem ser estável.
pub fn sort_items(items: &mut [CleanupItem]) {
    items.sort_by(|a, b| b.bytes.cmp(&a.bytes).then_with(|| a.path.cmp(&b.path)));
}

/// Item da Lixeira, lido do registro `$I` (o conteúdo fica no `$R` de mesmo sufixo).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecycledEntry {
    pub original_path: String,
    /// Tamanho do arquivo, ou da pasta inteira.
    pub bytes: u64,
    pub deleted_at_ms: Option<i64>,
}

/// Lê um registro `$I`. Versão 1 (Vista a 8.1): caminho fixo de 260
/// caracteres UTF-16. Versão 2 (Windows 10+): tamanho do caminho antes dele.
pub fn parse_recycle_info(data: &[u8]) -> Option<RecycledEntry> {
    let version = i64::from_le_bytes(data.get(0..8)?.try_into().ok()?);
    let bytes = u64::from_le_bytes(data.get(8..16)?.try_into().ok()?);
    let deleted_at = i64::from_le_bytes(data.get(16..24)?.try_into().ok()?);
    let path_bytes = match version {
        1 => data.get(24..24 + 520)?,
        2 => {
            let length = u32::from_le_bytes(data.get(24..28)?.try_into().ok()?) as usize;
            data.get(28..28 + length.checked_mul(2)?)?
        }
        _ => return None,
    };
    let units: Vec<u16> = path_bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .take_while(|&unit| unit != 0)
        .collect();
    let original_path = String::from_utf16_lossy(&units);
    if original_path.is_empty() {
        return None;
    }
    Some(RecycledEntry {
        original_path,
        bytes,
        deleted_at_ms: filetime_to_unix_ms(deleted_at),
    })
}

/// FILETIME (intervalos de 100 ns desde 1601) → milissegundos desde 1970.
pub fn filetime_to_unix_ms(filetime: i64) -> Option<i64> {
    const UNIX_EPOCH_AS_FILETIME: i64 = 116_444_736_000_000_000;
    (filetime > UNIX_EPOCH_AS_FILETIME).then(|| (filetime - UNIX_EPOCH_AS_FILETIME) / 10_000)
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOUR: Duration = Duration::from_secs(60 * 60);

    fn at(hours_ago: u64, now: SystemTime) -> Option<SystemTime> {
        Some(now - HOUR * hours_ago as u32)
    }

    #[test]
    fn every_source_appears_once_and_in_its_category() {
        let unique: HashSet<_> = CleanupSource::ALL.iter().collect();
        assert_eq!(unique.len(), CleanupSource::ALL.len());
        assert_eq!(
            CleanupSource::UserTemp.category(),
            CleanupCategoryId::TempFiles
        );
        assert_eq!(
            CleanupSource::RecycleBin.category(),
            CleanupCategoryId::RecycleBin
        );
        assert_eq!(
            CleanupSource::Chrome.category(),
            CleanupCategoryId::SafeCaches
        );
    }

    #[test]
    fn only_temp_files_have_a_minimum_age() {
        for source in CleanupSource::ALL {
            let expected = (source == CleanupSource::UserTemp).then_some(TEMP_MIN_AGE);
            assert_eq!(source.min_age(), expected, "{source:?}");
        }
    }

    #[test]
    fn allowlist_stays_inside_the_user_profile() {
        // Nenhuma regra aponta para fora de AppData nem sobe de pasta.
        for source in CleanupSource::ALL {
            if let SourceLayout::Folders(rules) = source.layout() {
                for rule in rules {
                    assert!(!rule.path.is_empty(), "{source:?}");
                    assert!(
                        rule.path
                            .iter()
                            .all(|part| !part.is_empty() && !part.contains(['.', '/', '\\'])),
                        "{source:?}: {:?}",
                        rule.path
                    );
                }
            }
        }
    }

    #[test]
    fn named_filter_matches_prefix_and_suffix_ignoring_case() {
        let thumbnails = FileFilter::Named {
            prefix: "thumbcache_",
            suffix: ".db",
        };
        assert!(thumbnails.matches("thumbcache_256.db"));
        assert!(thumbnails.matches("THUMBCACHE_IDX.DB"));
        assert!(!thumbnails.matches("iconcache_256.db"));
        assert!(!thumbnails.matches("thumbcache_256.db-wal"));
        assert!(!thumbnails.recursive());
        assert!(FileFilter::Everything.recursive());
    }

    #[test]
    fn recent_uses_the_newest_of_created_and_modified() {
        let now = SystemTime::now();
        // Extraído agora de um pacote antigo: recente pela data de criação.
        assert!(is_recent(at(1, now), at(24 * 400, now), now, TEMP_MIN_AGE));
        assert!(is_recent(at(48, now), at(2, now), now, TEMP_MIN_AGE));
        assert!(!is_recent(at(48, now), at(30, now), now, TEMP_MIN_AGE));
        assert!(!is_recent(None, at(25, now), now, TEMP_MIN_AGE));
        assert!(is_recent(None, at(23, now), now, TEMP_MIN_AGE));
    }

    #[test]
    fn missing_or_future_dates_count_as_recent() {
        let now = SystemTime::now();
        assert!(is_recent(None, None, now, TEMP_MIN_AGE));
        assert!(is_recent(None, Some(now + HOUR), now, TEMP_MIN_AGE));
    }

    fn scanned(source: CleanupSource, sizes: &[u64]) -> ScannedSource {
        let mut result = ScannedSource::new(source);
        result.folders.push("C:\\pasta".into());
        result.items = sizes
            .iter()
            .enumerate()
            .map(|(index, &bytes)| CleanupItem {
                path: format!("C:\\pasta\\{index}"),
                bytes,
                date_ms: None,
            })
            .collect();
        result
    }

    #[test]
    fn summary_totals_the_items() {
        let mut temp = scanned(CleanupSource::UserTemp, &[10, 20, 30]);
        temp.recent_count = 2;
        temp.recent_bytes = 5;
        temp.ignored_count = 1;
        let summary = summarize(&temp, &HashSet::new());
        assert_eq!(summary.status, SourceStatus::Ready);
        assert_eq!(summary.category, CleanupCategoryId::TempFiles);
        assert_eq!(summary.item_count, 3);
        assert_eq!(summary.total_bytes, 60);
        assert_eq!((summary.recent_count, summary.recent_bytes), (2, 5));
        assert_eq!(summary.ignored_count, 1);
    }

    #[test]
    fn source_without_folders_is_not_found() {
        let summary = summarize(
            &ScannedSource::new(CleanupSource::AmdShaders),
            &HashSet::new(),
        );
        assert_eq!(summary.status, SourceStatus::NotFound);
        assert_eq!(summary.total_bytes, 0);
    }

    #[test]
    fn browser_open_blocks_its_cache() {
        let running: HashSet<String> = ["chrome.exe".to_string()].into();
        let chrome = summarize(&scanned(CleanupSource::Chrome, &[1]), &running);
        assert_eq!(chrome.status, SourceStatus::InUse);
        assert_eq!(chrome.total_bytes, 1);
        let edge = summarize(&scanned(CleanupSource::Edge, &[1]), &running);
        assert_eq!(edge.status, SourceStatus::Ready);
        // Origens sem programa dono nunca ficam bloqueadas.
        let temp = summarize(&scanned(CleanupSource::UserTemp, &[1]), &running);
        assert_eq!(temp.status, SourceStatus::Ready);
    }

    #[test]
    fn items_are_sorted_largest_first() {
        let mut items = scanned(CleanupSource::UserTemp, &[5, 50, 5, 20]).items;
        sort_items(&mut items);
        let order: Vec<_> = items.iter().map(|item| item.path.as_str()).collect();
        assert_eq!(
            order,
            [
                "C:\\pasta\\1",
                "C:\\pasta\\3",
                "C:\\pasta\\0",
                "C:\\pasta\\2"
            ]
        );
    }

    fn utf16(text: &str) -> Vec<u8> {
        text.encode_utf16().flat_map(u16::to_le_bytes).collect()
    }

    /// 2026-09-25 12:00:00 UTC em FILETIME.
    const FILETIME: i64 = 134_348_112_000_000_000;
    const FILETIME_MS: i64 = 1_790_337_600_000;

    #[test]
    fn parses_version_2_records() {
        let path = "C:\\Users\\bruno\\Downloads\\relatório.pdf";
        let mut data = Vec::new();
        data.extend(2i64.to_le_bytes());
        data.extend(1_536u64.to_le_bytes());
        data.extend(FILETIME.to_le_bytes());
        data.extend((path.encode_utf16().count() as u32 + 1).to_le_bytes());
        data.extend(utf16(path));
        data.extend([0, 0]);

        assert_eq!(
            parse_recycle_info(&data),
            Some(RecycledEntry {
                original_path: path.into(),
                bytes: 1_536,
                deleted_at_ms: Some(FILETIME_MS),
            })
        );
    }

    #[test]
    fn parses_version_1_records() {
        let path = "D:\\Fotos\\antiga";
        let mut data = Vec::new();
        data.extend(1i64.to_le_bytes());
        data.extend(42u64.to_le_bytes());
        data.extend(FILETIME.to_le_bytes());
        let mut name = utf16(path);
        name.resize(520, 0);
        data.extend(name);

        let entry = parse_recycle_info(&data).unwrap();
        assert_eq!(entry.original_path, path);
        assert_eq!(entry.bytes, 42);
    }

    #[test]
    fn rejects_truncated_or_unknown_records() {
        assert_eq!(parse_recycle_info(&[]), None);
        let mut data = Vec::new();
        data.extend(3i64.to_le_bytes());
        data.extend([0; 40]);
        assert_eq!(parse_recycle_info(&data), None);

        // Versão 2 dizendo ter 100 caracteres, mas com só 2.
        let mut short = Vec::new();
        short.extend(2i64.to_le_bytes());
        short.extend(0u64.to_le_bytes());
        short.extend(FILETIME.to_le_bytes());
        short.extend(100u32.to_le_bytes());
        short.extend(utf16("C:"));
        assert_eq!(parse_recycle_info(&short), None);
    }

    #[test]
    fn converts_filetime_to_unix_milliseconds() {
        assert_eq!(filetime_to_unix_ms(FILETIME), Some(FILETIME_MS));
        assert_eq!(filetime_to_unix_ms(0), None);
    }
}
