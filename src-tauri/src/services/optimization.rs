//! Casos de uso da otimização: análise (somente leitura), listagem do que ela
//! encontrou e a limpeza (destrutiva, auditada).
//!
//! A última análise fica em memória (`CleanupScanStore`). A limpeza só age
//! sobre ela: a tela manda quais ORIGENS limpar, nunca caminhos, e o plano é
//! consumido ao começar (não dá para executá-lo duas vezes). O andamento e o
//! pedido de cancelamento ficam em `CleanupRun`, consultados pela tela enquanto
//! a limpeza roda.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde_json::json;

use crate::db::Database;
use crate::domain::audit::{AuditCategory, AuditOutcome, NewAuditEntry};
use crate::domain::optimization::{
    containing_folder, history_entry, sort_items, summarize, CleanupAnalyzer, CleanupExecutor,
    CleanupHistory, CleanupItem, CleanupItemPage, CleanupProgress, CleanupReport, CleanupScan,
    CleanupSource, NotRemovedItem, RemovalOutcome, SourceCleanupResult, SourceStatus,
    SourceSummary, CLEANUP_AUDIT_ACTION, HISTORY_MAX, ITEM_PAGE_MAX, NOT_REMOVED_SAMPLE,
    TEMP_MIN_AGE,
};
use crate::domain::system_monitor::ProcessList;
use crate::error::{AppError, AppResult};
use crate::repositories::{audit, cleanup_history};

const EXPIRED_SCAN: &str = "Esta análise não está mais disponível. Analise de novo.";

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
    sources: HashMap<CleanupSource, StoredSource>,
}

struct StoredSource {
    summary: SourceSummary,
    /// Maiores primeiro.
    items: Vec<CleanupItem>,
}

/// Uma origem do plano confirmado.
struct PlannedSource {
    source: CleanupSource,
    folders: Vec<String>,
    items: Vec<CleanupItem>,
}

impl CleanupScanStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Confere as origens pedidas e retira o plano da análise `scan_id`, que
    /// deixa de valer (um plano nunca é executado duas vezes).
    fn take_plan(
        &self,
        scan_id: u64,
        sources: &[CleanupSource],
        running: &HashSet<String>,
    ) -> AppResult<Vec<PlannedSource>> {
        let mut state = self.state.lock().map_err(|_| AppError::StatePoisoned)?;
        let scan = state
            .latest
            .as_ref()
            .filter(|scan| scan.id == scan_id)
            .ok_or(AppError::NotFound(EXPIRED_SCAN))?;
        for source in sources {
            let stored = scan
                .sources
                .get(source)
                .ok_or(AppError::NotFound(EXPIRED_SCAN))?;
            let owner = source.owner_name().unwrap_or("programa");
            match stored.summary.status {
                SourceStatus::Ready => {}
                SourceStatus::NotFound => {
                    return Err(AppError::Validation(
                        "Um dos locais escolhidos não existe neste computador. Analise de novo."
                            .into(),
                    ));
                }
                SourceStatus::InUse => {
                    return Err(AppError::Validation(format!(
                        "O {owner} estava aberto na análise. Feche-o e analise de novo."
                    )));
                }
            }
            if source
                .owner_process()
                .is_some_and(|process| running.contains(process))
            {
                return Err(AppError::Validation(format!(
                    "Feche o {owner} antes de limpar o cache dele."
                )));
            }
        }

        let mut scan = state
            .latest
            .take()
            .ok_or(AppError::NotFound(EXPIRED_SCAN))?;
        Ok(sources
            .iter()
            .filter_map(|source| scan.sources.remove(source))
            .map(|stored| PlannedSource {
                source: stored.summary.source,
                folders: stored.summary.folders,
                items: stored.items,
            })
            .collect())
    }
}

/// Limpeza em andamento: progresso para a tela e pedido de cancelamento.
#[derive(Default)]
pub struct CleanupRun {
    cancel: AtomicBool,
    progress: Mutex<Option<CleanupProgress>>,
}

/// Enquanto existir, marca a limpeza como em andamento.
struct RunGuard<'a>(&'a CleanupRun);

impl Drop for RunGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut progress) = self.0.progress.lock() {
            *progress = None;
        }
    }
}

impl CleanupRun {
    pub fn new() -> Self {
        Self::default()
    }

    fn begin(&self) -> AppResult<RunGuard<'_>> {
        let mut progress = self.progress.lock().map_err(|_| AppError::StatePoisoned)?;
        if progress.is_some() {
            return Err(AppError::Validation(
                "Já existe uma limpeza em andamento.".into(),
            ));
        }
        self.cancel.store(false, Ordering::SeqCst);
        *progress = Some(CleanupProgress {
            total_items: 0,
            processed_items: 0,
            removed_bytes: 0,
            current_source: None,
            cancel_requested: false,
        });
        Ok(RunGuard(self))
    }

    fn update(&self, change: impl FnOnce(&mut CleanupProgress)) {
        if let Ok(mut progress) = self.progress.lock() {
            if let Some(progress) = progress.as_mut() {
                change(progress);
            }
        }
    }

    fn cancel_requested(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    /// Andamento da limpeza em curso; `None` se nenhuma estiver rodando.
    pub fn progress(&self) -> AppResult<Option<CleanupProgress>> {
        Ok(self
            .progress
            .lock()
            .map_err(|_| AppError::StatePoisoned)?
            .clone())
    }

    /// Pede para parar antes do próximo arquivo. `false` se nada estava rodando.
    pub fn request_cancel(&self) -> AppResult<bool> {
        let mut progress = self.progress.lock().map_err(|_| AppError::StatePoisoned)?;
        let Some(progress) = progress.as_mut() else {
            return Ok(false);
        };
        progress.cancel_requested = true;
        self.cancel.store(true, Ordering::SeqCst);
        Ok(true)
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

/// Analisa os locais da allowlist e guarda os itens para a listagem e a
/// limpeza. Uma nova análise substitui a anterior.
pub fn run_scan(
    analyzer: &dyn CleanupAnalyzer,
    running: &HashSet<String>,
    store: &CleanupScanStore,
) -> AppResult<CleanupScan> {
    let scanned = analyzer.analyze()?;
    let summaries: Vec<SourceSummary> = scanned
        .iter()
        .map(|source| summarize(source, running))
        .collect();
    let sources = scanned
        .into_iter()
        .zip(summaries.iter().cloned())
        .map(|(mut source, summary)| {
            sort_items(&mut source.items);
            (
                source.source,
                StoredSource {
                    summary,
                    items: source.items,
                },
            )
        })
        .collect();

    let mut state = store.state.lock().map_err(|_| AppError::StatePoisoned)?;
    state.last_id += 1;
    let id = state.last_id;
    state.latest = Some(StoredScan { id, sources });
    Ok(CleanupScan {
        id,
        temp_min_age_hours: TEMP_MIN_AGE.as_secs() / 3600,
        sources: summaries,
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
        .ok_or(AppError::NotFound(EXPIRED_SCAN))?;
    let items = scan
        .sources
        .get(&source)
        .map_or(&[][..], |stored| stored.items.as_slice());
    Ok(CleanupItemPage {
        items: items.iter().skip(offset).take(limit).cloned().collect(),
        total: items.len(),
    })
}

/// Limpezas mais recentes (do `audit_log`) e os totais de todo o histórico.
pub fn cleanup_history(db: &Database, limit: u32) -> AppResult<CleanupHistory> {
    if limit == 0 || limit > HISTORY_MAX {
        return Err(AppError::Validation(format!(
            "Peça de 1 a {HISTORY_MAX} limpezas por vez."
        )));
    }
    db.with_connection(|connection| {
        let entries = audit::list_by_action(
            connection,
            AuditCategory::Optimization,
            CLEANUP_AUDIT_ACTION,
            limit,
        )?
        .iter()
        .filter_map(|entry| {
            history_entry(
                entry.id,
                &entry.occurred_at,
                &entry.outcome,
                entry.details.as_ref(),
            )
        })
        .collect();
        let (total_runs, total_removed_bytes) = cleanup_history::totals(connection)?;
        Ok(CleanupHistory {
            entries,
            total_runs,
            total_removed_bytes,
        })
    })
}

/// Condições do momento da limpeza.
pub struct CleanupContext {
    /// Processos abertos agora (minúsculas).
    pub running: HashSet<String>,
    /// App aberto como administrador: a limpeza se recusa a rodar.
    pub elevated: bool,
}

/// Limpa as origens escolhidas da análise `scan_id` e audita o resultado
/// (sucesso, cancelamento ou falha).
pub fn run_cleanup(
    db: &Database,
    store: &CleanupScanStore,
    run: &CleanupRun,
    executor: &mut dyn CleanupExecutor,
    scan_id: u64,
    sources: &[CleanupSource],
    context: &CleanupContext,
) -> AppResult<CleanupReport> {
    let result = execute(store, run, executor, scan_id, sources, context);
    let target = scan_id.to_string();
    match &result {
        Ok(report) => {
            let outcome = if report.cancelled {
                AuditOutcome::Cancelled
            } else {
                AuditOutcome::Success
            };
            let mut details = serde_json::to_value(report)?;
            details["removedCount"] = json!(report.removed_count());
            details["removedBytes"] = json!(report.removed_bytes());
            db.with_connection(|connection| {
                audit::record(
                    connection,
                    &NewAuditEntry {
                        category: AuditCategory::Optimization,
                        action: CLEANUP_AUDIT_ACTION,
                        target: Some(&target),
                        outcome,
                        details: Some(details),
                    },
                )
            })?;
        }
        Err(error) => {
            // Melhor esforço: a falha original é o erro relevante para o chamador.
            let _ = db.with_connection(|connection| {
                audit::record(
                    connection,
                    &NewAuditEntry {
                        category: AuditCategory::Optimization,
                        action: CLEANUP_AUDIT_ACTION,
                        target: Some(&target),
                        outcome: AuditOutcome::Failure,
                        details: Some(json!({ "sources": sources, "error": error.to_string() })),
                    },
                )
            });
        }
    }
    result
}

fn execute(
    store: &CleanupScanStore,
    run: &CleanupRun,
    executor: &mut dyn CleanupExecutor,
    scan_id: u64,
    requested: &[CleanupSource],
    context: &CleanupContext,
) -> AppResult<CleanupReport> {
    if context.elevated {
        return Err(AppError::Validation(
            "Por segurança, a limpeza não roda com o app aberto como administrador. Abra o app normalmente e tente de novo."
                .into(),
        ));
    }
    // Sem repetições e na ordem fixa (a Lixeira, que não dá para interromper, por último).
    let sources: Vec<CleanupSource> = CleanupSource::ALL
        .into_iter()
        .filter(|source| requested.contains(source))
        .collect();
    if sources.is_empty() {
        return Err(AppError::Validation(
            "Escolha ao menos um local para limpar.".into(),
        ));
    }

    let _guard = run.begin()?;
    let plan = store.take_plan(scan_id, &sources, &context.running)?;
    let total: usize = plan.iter().map(|planned| planned.items.len()).sum();
    run.update(|progress| progress.total_items = total as u64);

    let mut report = CleanupReport {
        cancelled: false,
        sources: Vec::new(),
        not_removed: Vec::new(),
    };
    for planned in &plan {
        let mut result = SourceCleanupResult::new(planned.source, planned.items.len() as u64);
        if report.cancelled {
            report.sources.push(result);
            continue;
        }
        run.update(|progress| progress.current_source = Some(planned.source));

        if planned.source == CleanupSource::RecycleBin {
            if run.cancel_requested() {
                report.cancelled = true;
            } else {
                // Tudo ou nada: a Lixeira é esvaziada de uma vez.
                let outcome = executor.empty_recycle_bin(&planned.items);
                for item in &planned.items {
                    record(&mut report, &mut result, run, item, outcome);
                }
            }
        } else {
            for item in &planned.items {
                if run.cancel_requested() {
                    report.cancelled = true;
                    break;
                }
                // Defesa extra: o caminho vem da análise, mas é conferido de novo.
                let outcome = match containing_folder(&planned.folders, &item.path) {
                    Some(folder) => executor.remove_file(folder, item),
                    None => RemovalOutcome::Refused,
                };
                record(&mut report, &mut result, run, item, outcome);
            }
            executor.remove_emptied_folders();
        }
        report.sources.push(result);
    }
    Ok(report)
}

fn record(
    report: &mut CleanupReport,
    result: &mut SourceCleanupResult,
    run: &CleanupRun,
    item: &CleanupItem,
    outcome: RemovalOutcome,
) {
    result.record(outcome, item.bytes);
    let removed = if outcome == RemovalOutcome::Removed {
        item.bytes
    } else {
        0
    };
    run.update(|progress| {
        progress.processed_items += 1;
        progress.removed_bytes += removed;
    });
    let keep = !matches!(outcome, RemovalOutcome::Removed | RemovalOutcome::Missing);
    if keep && report.not_removed.len() < NOT_REMOVED_SAMPLE {
        report.not_removed.push(NotRemovedItem {
            path: item.path.clone(),
            reason: outcome,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::optimization::{CleanupRunOutcome, ScannedSource};
    use crate::domain::system_monitor::ProcessGroup;

    /// Analisador simulado: temporários com três arquivos, cache do Chrome,
    /// Lixeira com dois itens e um item do Firefox fora da pasta dele.
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
                        CleanupSource::Firefox => {
                            scanned.folders.push("C:\\Firefox\\cache2".into());
                            scanned.items = vec![item("C:\\Windows\\win.ini", 1)];
                        }
                        CleanupSource::RecycleBin => {
                            scanned.folders.push("C:\\$Recycle.Bin\\S-1".into());
                            scanned.items =
                                vec![item("D:\\Fotos\\a.jpg", 7), item("D:\\Fotos\\b.jpg", 3)];
                        }
                        _ => {}
                    }
                    scanned
                })
                .collect())
        }
    }

    /// Executor simulado: registra as chamadas e devolve o resultado pedido
    /// (remoção, por padrão). Pode pedir cancelamento depois de N remoções.
    #[derive(Default)]
    struct FakeExecutor<'a> {
        removed: Vec<(String, String)>,
        outcomes: HashMap<String, RemovalOutcome>,
        emptied: Vec<usize>,
        folder_cleanups: usize,
        cancel_after: Option<(usize, &'a CleanupRun)>,
    }

    impl CleanupExecutor for FakeExecutor<'_> {
        fn remove_file(&mut self, folder: &str, item: &CleanupItem) -> RemovalOutcome {
            self.removed.push((folder.into(), item.path.clone()));
            if let Some((count, run)) = self.cancel_after {
                if self.removed.len() == count {
                    run.request_cancel().unwrap();
                }
            }
            self.outcomes
                .get(&item.path)
                .copied()
                .unwrap_or(RemovalOutcome::Removed)
        }

        fn remove_emptied_folders(&mut self) {
            self.folder_cleanups += 1;
        }

        fn empty_recycle_bin(&mut self, expected: &[CleanupItem]) -> RemovalOutcome {
            self.emptied.push(expected.len());
            RemovalOutcome::Removed
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

    fn context() -> CleanupContext {
        CleanupContext {
            running: HashSet::new(),
            elevated: false,
        }
    }

    fn audit_log(db: &Database) -> Vec<audit::AuditEntry> {
        db.with_connection(|connection| audit::list_recent(connection, 10))
            .unwrap()
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

    #[test]
    fn cleans_the_chosen_sources_and_audits_the_result() {
        let db = Database::open_in_memory().unwrap();
        let store = CleanupScanStore::new();
        let run = CleanupRun::new();
        let scan = run_scan(&FakeAnalyzer, &HashSet::new(), &store).unwrap();
        let mut executor = FakeExecutor {
            outcomes: [("C:\\Temp\\c".to_string(), RemovalOutcome::InUse)].into(),
            ..FakeExecutor::default()
        };

        let report = run_cleanup(
            &db,
            &store,
            &run,
            &mut executor,
            scan.id,
            // Fora de ordem e repetido: vira Temp → Lixeira.
            &[
                CleanupSource::RecycleBin,
                CleanupSource::UserTemp,
                CleanupSource::UserTemp,
            ],
            &context(),
        )
        .unwrap();

        assert!(!report.cancelled);
        let sources: Vec<_> = report.sources.iter().map(|result| result.source).collect();
        assert_eq!(
            sources,
            [CleanupSource::UserTemp, CleanupSource::RecycleBin]
        );
        let temp = &report.sources[0];
        assert_eq!((temp.planned_count, temp.removed_count), (3, 2));
        assert_eq!((temp.removed_bytes, temp.in_use_count), (310, 1));
        assert_eq!(report.sources[1].removed_bytes, 10);
        assert_eq!(report.removed_bytes(), 320);
        assert_eq!(
            report.not_removed,
            [NotRemovedItem {
                path: "C:\\Temp\\c".into(),
                reason: RemovalOutcome::InUse,
            }]
        );
        // Cada arquivo foi removido pela pasta analisada dele; o Chrome não entrou.
        assert!(executor
            .removed
            .iter()
            .all(|(folder, _)| folder == "C:\\Temp"));
        assert_eq!(executor.emptied, [2]);
        assert_eq!(executor.folder_cleanups, 1);
        assert_eq!(run.progress().unwrap(), None);

        let log = audit_log(&db);
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].category, "optimization");
        assert_eq!(log[0].action, CLEANUP_AUDIT_ACTION);
        assert_eq!(log[0].outcome, "success");
        let details = log[0].details.as_ref().unwrap();
        assert_eq!(details["removedBytes"], 320);
        assert_eq!(details["sources"][0]["source"], "userTemp");
    }

    #[test]
    fn a_plan_runs_only_once() {
        let db = Database::open_in_memory().unwrap();
        let store = CleanupScanStore::new();
        let run = CleanupRun::new();
        let scan = run_scan(&FakeAnalyzer, &HashSet::new(), &store).unwrap();
        let sources = [CleanupSource::UserTemp];

        run_cleanup(
            &db,
            &store,
            &run,
            &mut FakeExecutor::default(),
            scan.id,
            &sources,
            &context(),
        )
        .unwrap();
        let mut executor = FakeExecutor::default();
        let again = run_cleanup(
            &db,
            &store,
            &run,
            &mut executor,
            scan.id,
            &sources,
            &context(),
        );
        assert!(matches!(again, Err(AppError::NotFound(_))));
        assert!(executor.removed.is_empty());
        // A análise também deixa de ser listável.
        assert!(list_items(&store, scan.id, CleanupSource::UserTemp, 0, 10).is_err());
        assert_eq!(audit_log(&db)[0].outcome, "failure");
    }

    #[test]
    fn stops_between_files_when_cancelled() {
        let db = Database::open_in_memory().unwrap();
        let store = CleanupScanStore::new();
        let run = CleanupRun::new();
        let scan = run_scan(&FakeAnalyzer, &HashSet::new(), &store).unwrap();
        let mut executor = FakeExecutor {
            cancel_after: Some((1, &run)),
            ..FakeExecutor::default()
        };

        let report = run_cleanup(
            &db,
            &store,
            &run,
            &mut executor,
            scan.id,
            &[CleanupSource::UserTemp, CleanupSource::RecycleBin],
            &context(),
        )
        .unwrap();

        assert!(report.cancelled);
        assert_eq!(executor.removed.len(), 1);
        assert!(executor.emptied.is_empty());
        assert_eq!(report.sources[0].removed_count, 1);
        // A Lixeira aparece no relatório, sem nada processado.
        assert_eq!(report.sources[1].planned_count, 2);
        assert_eq!(report.sources[1].removed_count, 0);
        assert_eq!(audit_log(&db)[0].outcome, "cancelled");
    }

    #[test]
    fn refuses_items_outside_their_folder_without_touching_them() {
        let db = Database::open_in_memory().unwrap();
        let store = CleanupScanStore::new();
        let run = CleanupRun::new();
        let scan = run_scan(&FakeAnalyzer, &HashSet::new(), &store).unwrap();
        let mut executor = FakeExecutor::default();

        let report = run_cleanup(
            &db,
            &store,
            &run,
            &mut executor,
            scan.id,
            &[CleanupSource::Firefox],
            &context(),
        )
        .unwrap();
        assert!(executor.removed.is_empty());
        assert_eq!(report.sources[0].failed_count, 1);
        assert_eq!(report.not_removed[0].reason, RemovalOutcome::Refused);
    }

    #[test]
    fn browser_caches_need_the_browser_closed() {
        let db = Database::open_in_memory().unwrap();
        let store = CleanupScanStore::new();
        let run = CleanupRun::new();
        // Aberto na análise.
        let scan = run_scan(&FakeAnalyzer, &running(&["chrome.exe"]), &store).unwrap();
        let result = run_cleanup(
            &db,
            &store,
            &run,
            &mut FakeExecutor::default(),
            scan.id,
            &[CleanupSource::Chrome],
            &context(),
        );
        let Err(AppError::Validation(message)) = result else {
            panic!("esperava erro de validação");
        };
        assert!(message.contains("Google Chrome"), "{message}");

        // Fechado na análise, mas aberto de novo na hora de limpar.
        let scan = run_scan(&FakeAnalyzer, &HashSet::new(), &store).unwrap();
        let mut executor = FakeExecutor::default();
        let result = run_cleanup(
            &db,
            &store,
            &run,
            &mut executor,
            scan.id,
            &[CleanupSource::Chrome],
            &CleanupContext {
                running: running(&["chrome.exe"]),
                elevated: false,
            },
        );
        assert!(matches!(result, Err(AppError::Validation(_))));
        assert!(executor.removed.is_empty());
        // A análise continua valendo: dá para fechar o navegador e tentar de novo.
        assert!(list_items(&store, scan.id, CleanupSource::Chrome, 0, 10).is_ok());
        assert!(audit_log(&db)
            .iter()
            .all(|entry| entry.outcome == "failure"));
    }

    #[test]
    fn never_runs_as_administrator_or_without_sources() {
        let db = Database::open_in_memory().unwrap();
        let store = CleanupScanStore::new();
        let run = CleanupRun::new();
        let scan = run_scan(&FakeAnalyzer, &HashSet::new(), &store).unwrap();
        let mut executor = FakeExecutor::default();

        let elevated = CleanupContext {
            running: HashSet::new(),
            elevated: true,
        };
        assert!(matches!(
            run_cleanup(
                &db,
                &store,
                &run,
                &mut executor,
                scan.id,
                &[CleanupSource::UserTemp],
                &elevated
            ),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            run_cleanup(&db, &store, &run, &mut executor, scan.id, &[], &context()),
            Err(AppError::Validation(_))
        ));
        assert!(executor.removed.is_empty());
        assert_eq!(audit_log(&db).len(), 2);
    }

    #[test]
    fn only_one_cleanup_at_a_time() {
        let run = CleanupRun::new();
        assert!(!run.request_cancel().unwrap());
        let guard = run.begin().unwrap();
        assert!(matches!(run.begin(), Err(AppError::Validation(_))));
        assert!(run.request_cancel().unwrap());
        assert!(run.progress().unwrap().unwrap().cancel_requested);
        drop(guard);
        assert_eq!(run.progress().unwrap(), None);
        // Uma nova limpeza começa sem o cancelamento anterior.
        let _guard = run.begin().unwrap();
        assert!(!run.cancel_requested());
    }

    #[test]
    fn history_lists_runs_newest_first_with_totals() {
        let db = Database::open_in_memory().unwrap();
        let store = CleanupScanStore::new();
        let run = CleanupRun::new();

        let scan = run_scan(&FakeAnalyzer, &HashSet::new(), &store).unwrap();
        run_cleanup(
            &db,
            &store,
            &run,
            &mut FakeExecutor::default(),
            scan.id,
            &[CleanupSource::UserTemp],
            &context(),
        )
        .unwrap();
        // Recusada: a análise já foi usada.
        let _ = run_cleanup(
            &db,
            &store,
            &run,
            &mut FakeExecutor::default(),
            scan.id,
            &[CleanupSource::Edge],
            &context(),
        );

        let history = cleanup_history(&db, 10).unwrap();
        assert_eq!(history.total_runs, 1);
        assert_eq!(history.total_removed_bytes, 330);
        assert_eq!(history.entries.len(), 2);
        let [failed, done] = &history.entries[..] else {
            panic!("esperava duas limpezas");
        };
        assert_eq!(failed.outcome, CleanupRunOutcome::Failed);
        assert_eq!(failed.sources, [CleanupSource::Edge]);
        assert!(failed.error.is_some());
        assert_eq!(done.outcome, CleanupRunOutcome::Completed);
        assert_eq!((done.removed_count, done.removed_bytes), (3, 330));

        assert_eq!(cleanup_history(&db, 1).unwrap().entries.len(), 1);
        assert!(matches!(
            cleanup_history(&db, 0),
            Err(AppError::Validation(_))
        ));
    }
}
