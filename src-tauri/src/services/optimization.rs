//! Casos de uso da otimização. Na 4.1, só análise (somente leitura) e a
//! listagem do que ela encontrou: nada é gravado no banco nem removido do disco.
//!
//! A última análise fica em memória (`CleanupScanStore`), para a tela listar
//! os itens por página e, na 4.2, para a limpeza agir só sobre o que o usuário
//! viu e confirmou.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use crate::domain::optimization::{
    sort_items, summarize, CleanupAnalyzer, CleanupItem, CleanupItemPage, CleanupScan,
    CleanupSource, ITEM_PAGE_MAX, TEMP_MIN_AGE,
};
use crate::domain::system_monitor::ProcessList;
use crate::error::{AppError, AppResult};

/// Última análise feita (só em memória).
#[derive(Default)]
pub struct CleanupScanStore {
    state: Mutex<StoreState>,
}

#[derive(Default)]
struct StoreState {
    last_id: u64,
    latest: Option<StoredScan>,
}

struct StoredScan {
    id: u64,
    /// Itens de cada origem, maiores primeiro.
    items: HashMap<CleanupSource, Vec<CleanupItem>>,
}

impl CleanupScanStore {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Nomes dos processos abertos, em minúsculas.
pub fn running_process_names(processes: &ProcessList) -> HashSet<String> {
    processes
        .groups
        .iter()
        .map(|group| group.name.to_lowercase())
        .collect()
}

/// Analisa os locais da allowlist e guarda os itens para a listagem. Uma nova
/// análise substitui a anterior.
pub fn run_scan(
    analyzer: &dyn CleanupAnalyzer,
    running: &HashSet<String>,
    store: &CleanupScanStore,
) -> AppResult<CleanupScan> {
    let scanned = analyzer.analyze()?;
    let sources = scanned
        .iter()
        .map(|source| summarize(source, running))
        .collect();
    let items = scanned
        .into_iter()
        .map(|mut source| {
            sort_items(&mut source.items);
            (source.source, source.items)
        })
        .collect();

    let mut state = store.state.lock().map_err(|_| AppError::StatePoisoned)?;
    state.last_id += 1;
    let id = state.last_id;
    state.latest = Some(StoredScan { id, items });
    Ok(CleanupScan {
        id,
        temp_min_age_hours: TEMP_MIN_AGE.as_secs() / 3600,
        sources,
    })
}

/// Uma página dos itens de uma origem da análise `scan_id`.
pub fn list_items(
    store: &CleanupScanStore,
    scan_id: u64,
    source: CleanupSource,
    offset: usize,
    limit: usize,
) -> AppResult<CleanupItemPage> {
    if limit == 0 || limit > ITEM_PAGE_MAX {
        return Err(AppError::Validation(format!(
            "Peça de 1 a {ITEM_PAGE_MAX} itens por vez."
        )));
    }
    let state = store.state.lock().map_err(|_| AppError::StatePoisoned)?;
    let scan = state
        .latest
        .as_ref()
        .filter(|scan| scan.id == scan_id)
        .ok_or(AppError::NotFound(
            "Esta análise não está mais disponível. Analise de novo.",
        ))?;
    let items = scan.items.get(&source).map_or(&[][..], Vec::as_slice);
    Ok(CleanupItemPage {
        items: items.iter().skip(offset).take(limit).cloned().collect(),
        total: items.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::optimization::{ScannedSource, SourceStatus};
    use crate::domain::system_monitor::ProcessGroup;

    /// Analisador simulado: temporários com três arquivos e cache do Chrome.
    struct FakeAnalyzer;

    fn item(path: &str, bytes: u64) -> CleanupItem {
        CleanupItem {
            path: path.into(),
            bytes,
            date_ms: None,
        }
    }

    impl CleanupAnalyzer for FakeAnalyzer {
        fn analyze(&self) -> AppResult<Vec<ScannedSource>> {
            Ok(CleanupSource::ALL
                .iter()
                .map(|&source| {
                    let mut scanned = ScannedSource::new(source);
                    match source {
                        CleanupSource::UserTemp => {
                            scanned.folders.push("C:\\Temp".into());
                            scanned.items = vec![
                                item("C:\\Temp\\a", 10),
                                item("C:\\Temp\\b", 300),
                                item("C:\\Temp\\c", 20),
                            ];
                        }
                        CleanupSource::Chrome => {
                            scanned.folders.push("C:\\Chrome\\Cache".into());
                            scanned.items = vec![item("C:\\Chrome\\Cache\\f", 5)];
                        }
                        _ => {}
                    }
                    scanned
                })
                .collect())
        }
    }

    fn running(names: &[&str]) -> HashSet<String> {
        running_process_names(&ProcessList {
            cpu_measured: true,
            total_processes: names.len(),
            groups: names
                .iter()
                .map(|name| ProcessGroup {
                    name: (*name).into(),
                    instances: 1,
                    cpu_percent: 0.0,
                    memory_bytes: 0,
                })
                .collect(),
        })
    }

    #[test]
    fn summarizes_every_source() {
        let store = CleanupScanStore::new();
        let scan = run_scan(&FakeAnalyzer, &running(&["Chrome.exe"]), &store).unwrap();

        assert_eq!(scan.temp_min_age_hours, 24);
        assert_eq!(scan.sources.len(), CleanupSource::ALL.len());
        let temp = &scan.sources[0];
        assert_eq!(temp.source, CleanupSource::UserTemp);
        assert_eq!((temp.item_count, temp.total_bytes), (3, 330));
        let chrome = scan
            .sources
            .iter()
            .find(|source| source.source == CleanupSource::Chrome)
            .unwrap();
        // O nome do processo é comparado sem diferenciar maiúsculas.
        assert_eq!(chrome.status, SourceStatus::InUse);
        let amd = scan
            .sources
            .iter()
            .find(|source| source.source == CleanupSource::AmdShaders)
            .unwrap();
        assert_eq!(amd.status, SourceStatus::NotFound);
    }

    #[test]
    fn lists_items_by_page_largest_first() {
        let store = CleanupScanStore::new();
        let scan = run_scan(&FakeAnalyzer, &HashSet::new(), &store).unwrap();

        let first = list_items(&store, scan.id, CleanupSource::UserTemp, 0, 2).unwrap();
        assert_eq!(first.total, 3);
        let paths: Vec<_> = first.items.iter().map(|item| item.path.as_str()).collect();
        assert_eq!(paths, ["C:\\Temp\\b", "C:\\Temp\\c"]);

        let rest = list_items(&store, scan.id, CleanupSource::UserTemp, 2, 2).unwrap();
        assert_eq!(rest.items, [item("C:\\Temp\\a", 10)]);

        let empty = list_items(&store, scan.id, CleanupSource::AmdShaders, 0, 50).unwrap();
        assert_eq!(empty.total, 0);
    }

    #[test]
    fn only_the_latest_scan_can_be_listed() {
        let store = CleanupScanStore::new();
        let old = run_scan(&FakeAnalyzer, &HashSet::new(), &store).unwrap();
        let new = run_scan(&FakeAnalyzer, &HashSet::new(), &store).unwrap();
        assert!(new.id > old.id);

        assert!(matches!(
            list_items(&store, old.id, CleanupSource::UserTemp, 0, 10),
            Err(AppError::NotFound(_))
        ));
        assert!(list_items(&store, new.id, CleanupSource::UserTemp, 0, 10).is_ok());
    }

    #[test]
    fn rejects_invalid_page_sizes() {
        let store = CleanupScanStore::new();
        let scan = run_scan(&FakeAnalyzer, &HashSet::new(), &store).unwrap();
        for limit in [0, ITEM_PAGE_MAX + 1] {
            assert!(matches!(
                list_items(&store, scan.id, CleanupSource::UserTemp, 0, limit),
                Err(AppError::Validation(_))
            ));
        }
    }

    #[test]
    fn listing_before_any_scan_is_not_found() {
        let store = CleanupScanStore::new();
        assert!(matches!(
            list_items(&store, 1, CleanupSource::UserTemp, 0, 10),
            Err(AppError::NotFound(_))
        ));
    }
}
