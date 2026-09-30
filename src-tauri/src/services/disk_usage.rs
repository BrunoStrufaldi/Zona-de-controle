//! Casos de uso do Espaço em disco: análise da unidade (somente leitura),
//! andamento, cancelamento e a listagem da árvore.
//!
//! A análise lê as pastas em algumas threads (`DirectoryLister`) e monta a
//! árvore numa só (`DiskTreeBuilder`). A última análise concluída fica em
//! memória (`DiskUsageStore`); cancelar mantém a anterior. Nada é gravado.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::domain::disk_usage::{
    unaccounted_bytes, DirectoryLister, DiskEntry, DiskTree, DiskTreeBuilder, FolderChildren,
    FolderId, LargeFile, RawEntry, ScanStats, Totals, CHILDREN_MAX, ROOT,
};
use crate::domain::system_monitor::{DiskKind, DiskUsage};
use crate::error::{AppError, AppResult};

const EXPIRED_SCAN: &str = "Esta análise não está mais disponível. Analise de novo.";

/// Threads de leitura num SSD (em HD, leituras paralelas brigam pela agulha).
const MAX_WORKERS: usize = 8;
const HDD_WORKERS: usize = 2;

/// Unidade a analisar, como lida pelo monitor.
#[derive(Debug, Clone)]
pub struct Volume {
    /// Ex.: "C:".
    pub mount_point: String,
    pub file_system: String,
    pub kind: DiskKind,
    pub total_bytes: u64,
    pub used_bytes: u64,
}

impl From<DiskUsage> for Volume {
    fn from(disk: DiskUsage) -> Self {
        Self {
            mount_point: disk.mount_point,
            file_system: disk.file_system,
            kind: disk.kind,
            total_bytes: disk.total_bytes,
            used_bytes: disk.used_bytes,
        }
    }
}

impl Volume {
    /// Raiz da unidade (ex.: "C:\").
    fn root_path(&self) -> String {
        format!("{}\\", self.mount_point)
    }

    /// Só o NTFS (e o ReFS) tem identificador único por arquivo.
    fn tracks_hard_links(&self) -> bool {
        matches!(self.file_system.to_uppercase().as_str(), "NTFS" | "REFS")
    }

    fn workers(&self) -> usize {
        if self.kind == DiskKind::Hdd {
            return HDD_WORKERS;
        }
        thread::available_parallelism().map_or(4, |count| count.get().clamp(2, MAX_WORKERS))
    }
}

/// Resumo de uma análise concluída.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskUsageScan {
    pub id: u64,
    pub mount_point: String,
    pub file_system: String,
    pub volume_total_bytes: u64,
    pub volume_used_bytes: u64,
    /// A raiz da árvore (ex.: "C:\"), com as somas da unidade.
    pub root: DiskEntry,
    pub totals: Totals,
    pub stats: ScanStats,
    /// Em uso na unidade, mas fora das pastas lidas.
    pub unaccounted_bytes: u64,
    pub largest_files: Vec<LargeFile>,
    pub finished_at_ms: i64,
    pub duration_ms: u64,
}

/// Andamento da análise em curso.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskUsageProgress {
    pub mount_point: String,
    pub files: u64,
    pub folders: u64,
    pub allocated_bytes: u64,
    /// Última pasta lida.
    pub current_folder: Option<String>,
    pub cancel_requested: bool,
}

struct StoredScan {
    summary: DiskUsageScan,
    tree: DiskTree,
}

/// Última análise concluída (só em memória).
#[derive(Default)]
pub struct DiskUsageStore {
    state: Mutex<StoreState>,
}

#[derive(Default)]
struct StoreState {
    last_id: u64,
    latest: Option<Arc<StoredScan>>,
}

impl DiskUsageStore {
    pub fn new() -> Self {
        Self::default()
    }

    fn latest(&self) -> AppResult<Option<Arc<StoredScan>>> {
        Ok(self
            .state
            .lock()
            .map_err(|_| AppError::StatePoisoned)?
            .latest
            .clone())
    }
}

/// Análise em andamento: progresso para a tela e pedido de cancelamento.
#[derive(Default)]
pub struct DiskUsageRun {
    cancel: AtomicBool,
    progress: Mutex<Option<DiskUsageProgress>>,
}

/// Enquanto existir, marca a análise como em andamento.
struct RunGuard<'a>(&'a DiskUsageRun);

impl Drop for RunGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut progress) = self.0.progress.lock() {
            *progress = None;
        }
    }
}

impl DiskUsageRun {
    pub fn new() -> Self {
        Self::default()
    }

    fn begin(&self, mount_point: &str) -> AppResult<RunGuard<'_>> {
        let mut progress = self.progress.lock().map_err(|_| AppError::StatePoisoned)?;
        if progress.is_some() {
            return Err(AppError::Validation(
                "Já existe uma análise em andamento.".into(),
            ));
        }
        self.cancel.store(false, Ordering::SeqCst);
        *progress = Some(DiskUsageProgress {
            mount_point: mount_point.to_owned(),
            files: 0,
            folders: 0,
            allocated_bytes: 0,
            current_folder: None,
            cancel_requested: false,
        });
        Ok(RunGuard(self))
    }

    fn cancel_requested(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    fn update(&self, builder: &DiskTreeBuilder, folder: &Path) {
        if let Ok(mut progress) = self.progress.lock() {
            if let Some(progress) = progress.as_mut() {
                let built = builder.progress();
                progress.files = built.files;
                progress.folders = built.folders;
                progress.allocated_bytes = built.allocated_bytes;
                progress.current_folder = Some(folder.to_string_lossy().into_owned());
            }
        }
    }

    /// Andamento da análise em curso; `None` se nenhuma estiver rodando.
    pub fn progress(&self) -> AppResult<Option<DiskUsageProgress>> {
        Ok(self
            .progress
            .lock()
            .map_err(|_| AppError::StatePoisoned)?
            .clone())
    }

    /// Pede para parar. `false` se nada estava rodando.
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

/// Analisa a unidade inteira e guarda o resultado como a última análise.
/// `None` se foi cancelada (a análise anterior continua valendo).
pub fn run_scan(
    lister: &dyn DirectoryLister,
    volume: &Volume,
    run: &DiskUsageRun,
    store: &DiskUsageStore,
) -> AppResult<Option<DiskUsageScan>> {
    let _guard = run.begin(&volume.mount_point)?;
    let started = Instant::now();
    let root_path = volume.root_path();
    let mut builder = DiskTreeBuilder::new(&root_path, volume.tracks_hard_links());
    if !traverse(
        lister,
        PathBuf::from(&root_path),
        volume.workers(),
        &mut builder,
        run,
    ) {
        return Ok(None);
    }
    let tree = builder.finish();

    let mut state = store.state.lock().map_err(|_| AppError::StatePoisoned)?;
    state.last_id += 1;
    let totals = tree.totals();
    let summary = DiskUsageScan {
        id: state.last_id,
        mount_point: volume.mount_point.clone(),
        file_system: volume.file_system.clone(),
        volume_total_bytes: volume.total_bytes,
        volume_used_bytes: volume.used_bytes,
        root: tree.entry(ROOT).ok_or(AppError::StatePoisoned)?,
        totals,
        stats: tree.stats(),
        unaccounted_bytes: unaccounted_bytes(volume.used_bytes, totals.allocated_bytes),
        largest_files: tree.largest_files().to_vec(),
        finished_at_ms: now_ms(),
        duration_ms: u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX),
    };
    // A análise anterior sai da memória só agora que a nova está pronta.
    state.latest = Some(Arc::new(StoredScan {
        summary: summary.clone(),
        tree,
    }));
    Ok(Some(summary))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|elapsed| i64::try_from(elapsed.as_millis()).ok())
        .unwrap_or(0)
}

type Job = (FolderId, PathBuf);
type Listing = (FolderId, PathBuf, Option<Vec<RawEntry>>);

/// Lê as pastas em `workers` threads e monta a árvore nesta. `false` se foi
/// cancelada.
fn traverse(
    lister: &dyn DirectoryLister,
    root: PathBuf,
    workers: usize,
    builder: &mut DiskTreeBuilder,
    run: &DiskUsageRun,
) -> bool {
    let (job_tx, job_rx) = mpsc::channel::<Job>();
    let job_rx = Mutex::new(job_rx);
    let (result_tx, result_rx) = mpsc::channel::<Listing>();

    thread::scope(|scope| {
        for _ in 0..workers {
            let (job_rx, result_tx) = (&job_rx, result_tx.clone());
            scope.spawn(move || loop {
                // O lock só dura o `recv`: as outras threads esperam a vez de pegar trabalho.
                let job = match job_rx.lock() {
                    Ok(receiver) => receiver.recv(),
                    Err(_) => return,
                };
                let Ok((folder, path)) = job else {
                    return; // Fila fechada: acabou.
                };
                // Cancelada: devolve sem ler, só para a contagem fechar.
                let listing = (!run.cancel_requested())
                    .then(|| lister.list(&path))
                    .flatten();
                if result_tx.send((folder, path, listing)).is_err() {
                    return;
                }
            });
        }
        drop(result_tx);

        let mut pending = 1usize;
        let mut completed = job_tx.send((ROOT, root)).is_ok();
        while completed && pending > 0 {
            let Ok((folder, path, listing)) = result_rx.recv() else {
                completed = false;
                break;
            };
            pending -= 1;
            if run.cancel_requested() {
                completed = false;
                break;
            }
            match listing {
                Some(entries) => {
                    for (child, name) in builder.add_listing(folder, entries) {
                        if job_tx.send((child, path.join(name))).is_err() {
                            completed = false;
                        }
                        pending += 1;
                    }
                }
                None => builder.mark_unreadable(folder),
            }
            run.update(builder, &path);
        }
        // Fecha a fila: as threads terminam o que pegaram e saem (cancelada,
        // passam direto pelo que falta).
        drop(job_tx);
        completed
    })
}

/// A última análise concluída, se houver.
pub fn latest_scan(store: &DiskUsageStore) -> AppResult<Option<DiskUsageScan>> {
    Ok(store.latest()?.map(|stored| stored.summary.clone()))
}

/// Conteúdo de uma pasta da análise `scan_id`, maiores primeiro.
pub fn list_children(
    store: &DiskUsageStore,
    scan_id: u64,
    folder_id: FolderId,
    limit: usize,
) -> AppResult<FolderChildren> {
    if limit == 0 || limit > CHILDREN_MAX {
        return Err(AppError::Validation(format!(
            "Peça de 1 a {CHILDREN_MAX} itens por vez."
        )));
    }
    let stored = store
        .latest()?
        .filter(|stored| stored.summary.id == scan_id)
        .ok_or(AppError::NotFound(EXPIRED_SCAN))?;
    stored
        .tree
        .children(folder_id, limit)
        .ok_or(AppError::NotFound("Pasta não encontrada nesta análise."))
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;
    use crate::domain::disk_usage::EntryKind;

    /// Pastas simuladas: caminho → conteúdo (`None` = sem acesso).
    struct FakeLister {
        folders: HashMap<PathBuf, Option<Vec<RawEntry>>>,
        /// Pede o cancelamento ao listar esta pasta.
        cancel_at: Option<(PathBuf, Arc<DiskUsageRun>)>,
    }

    impl DirectoryLister for FakeLister {
        fn list(&self, path: &Path) -> Option<Vec<RawEntry>> {
            if let Some((at, run)) = &self.cancel_at {
                if at == path {
                    run.request_cancel().unwrap();
                }
            }
            self.folders.get(path).cloned().flatten()
        }
    }

    fn entry(name: &str, kind: EntryKind, allocated: u64, file_id: Option<u64>) -> RawEntry {
        RawEntry {
            name: name.into(),
            kind,
            bytes: allocated,
            allocated_bytes: allocated,
            modified_ms: None,
            file_id,
            cloud_only: false,
        }
    }

    fn sample_lister() -> FakeLister {
        let mut folders = HashMap::new();
        folders.insert(
            PathBuf::from("C:\\"),
            Some(vec![
                entry("Users", EntryKind::Folder, 0, None),
                entry("Windows", EntryKind::Folder, 0, None),
                entry("System Volume Information", EntryKind::Folder, 0, None),
                entry("Documents and Settings", EntryKind::Link, 0, None),
                entry("pagefile.sys", EntryKind::File, 4_000, Some(1)),
            ]),
        );
        folders.insert(
            PathBuf::from("C:\\Users"),
            Some(vec![entry("foto.jpg", EntryKind::File, 300, Some(2))]),
        );
        folders.insert(
            PathBuf::from("C:\\Windows"),
            Some(vec![
                entry("WinSxS", EntryKind::Folder, 0, None),
                entry("kernel.dll", EntryKind::File, 500, Some(3)),
            ]),
        );
        folders.insert(
            PathBuf::from("C:\\Windows\\WinSxS"),
            Some(vec![entry("kernel.dll", EntryKind::File, 500, Some(3))]),
        );
        folders.insert(PathBuf::from("C:\\System Volume Information"), None);
        FakeLister {
            folders,
            cancel_at: None,
        }
    }

    fn volume(used_bytes: u64) -> Volume {
        Volume {
            mount_point: "C:".into(),
            file_system: "NTFS".into(),
            kind: DiskKind::Ssd,
            total_bytes: 10_000,
            used_bytes,
        }
    }

    #[test]
    fn scans_the_whole_drive_and_keeps_it_for_listing() {
        let (run, store) = (DiskUsageRun::new(), DiskUsageStore::new());
        let scan = run_scan(&sample_lister(), &volume(6_000), &run, &store)
            .unwrap()
            .unwrap();

        assert_eq!(scan.root.name, "C:\\");
        // O kernel.dll em WinSxS é link físico do mesmo arquivo: conta uma vez.
        assert_eq!(scan.totals.allocated_bytes, 4_800);
        assert_eq!(scan.totals.files, 3);
        assert_eq!(scan.totals.unreadable_folders, 1);
        assert_eq!(scan.stats.skipped_links, 1);
        assert_eq!(scan.stats.hard_link_duplicates, 1);
        assert_eq!(scan.unaccounted_bytes, 1_200);
        assert_eq!(scan.largest_files[0].path, "C:\\pagefile.sys");
        assert!(run.progress().unwrap().is_none(), "terminou");

        assert_eq!(latest_scan(&store).unwrap().unwrap().id, scan.id);
        let root = list_children(&store, scan.id, ROOT, 10).unwrap();
        let names: Vec<_> = root.entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(
            names,
            [
                "pagefile.sys",
                "Windows",
                "Users",
                "System Volume Information"
            ]
        );
    }

    #[test]
    fn listing_needs_the_current_scan_and_a_valid_limit() {
        let (run, store) = (DiskUsageRun::new(), DiskUsageStore::new());
        assert!(matches!(
            list_children(&store, 1, ROOT, 10),
            Err(AppError::NotFound(_))
        ));
        let first = run_scan(&sample_lister(), &volume(6_000), &run, &store)
            .unwrap()
            .unwrap();
        let second = run_scan(&sample_lister(), &volume(6_000), &run, &store)
            .unwrap()
            .unwrap();
        assert!(second.id > first.id);
        assert!(matches!(
            list_children(&store, first.id, ROOT, 10),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            list_children(&store, second.id, 999, 10),
            Err(AppError::NotFound(_))
        ));
        for limit in [0, CHILDREN_MAX + 1] {
            assert!(matches!(
                list_children(&store, second.id, ROOT, limit),
                Err(AppError::Validation(_))
            ));
        }
    }

    #[test]
    fn cancelling_keeps_the_previous_scan() {
        let store = DiskUsageStore::new();
        let run = Arc::new(DiskUsageRun::new());
        let previous = run_scan(&sample_lister(), &volume(6_000), &run, &store)
            .unwrap()
            .unwrap();

        let lister = FakeLister {
            cancel_at: Some((PathBuf::from("C:\\Windows"), Arc::clone(&run))),
            ..sample_lister()
        };
        assert!(run_scan(&lister, &volume(6_000), &run, &store)
            .unwrap()
            .is_none());
        assert_eq!(latest_scan(&store).unwrap().unwrap().id, previous.id);
        assert!(run.progress().unwrap().is_none());
        assert!(!run.request_cancel().unwrap(), "nada rodando");
    }

    #[test]
    fn other_file_systems_do_not_merge_files_by_id() {
        let (run, store) = (DiskUsageRun::new(), DiskUsageStore::new());
        let pendrive = Volume {
            file_system: "exFAT".into(),
            kind: DiskKind::Unknown,
            ..volume(6_000)
        };
        let scan = run_scan(&sample_lister(), &pendrive, &run, &store)
            .unwrap()
            .unwrap();
        assert_eq!(scan.totals.allocated_bytes, 5_300);
        assert_eq!(scan.stats.hard_link_duplicates, 0);
    }

    #[test]
    fn an_unreadable_root_is_still_a_result() {
        let (run, store) = (DiskUsageRun::new(), DiskUsageStore::new());
        let lister = FakeLister {
            folders: HashMap::new(),
            cancel_at: None,
        };
        let scan = run_scan(&lister, &volume(6_000), &run, &store)
            .unwrap()
            .unwrap();
        assert!(scan.root.unreadable);
        assert_eq!(scan.unaccounted_bytes, 6_000);
    }

    /// Mede a análise do C: deste computador (só com `--ignored`).
    #[cfg(windows)]
    #[test]
    #[ignore = "percorre o C: inteiro"]
    fn measures_the_real_system_drive() {
        use crate::platform::disk_usage::VolumeLister;

        let (run, store) = (DiskUsageRun::new(), DiskUsageStore::new());
        let drive = Volume {
            mount_point: "C:".into(),
            file_system: "NTFS".into(),
            kind: DiskKind::Ssd,
            total_bytes: 0,
            used_bytes: 0,
        };
        let scan = run_scan(&VolumeLister, &drive, &run, &store)
            .unwrap()
            .unwrap();
        let gib = |bytes: u64| bytes as f64 / (1u64 << 30) as f64;
        println!(
            "{} ms · {} arquivos · {} pastas · {:.2} GiB em disco ({:.2} GiB de tamanho) · {} sem acesso · {} links ignorados · {} links físicos repetidos ({:.2} GiB) · {} só na nuvem ({:.2} GiB)",
            scan.duration_ms,
            scan.totals.files,
            scan.totals.folders,
            gib(scan.totals.allocated_bytes),
            gib(scan.totals.bytes),
            scan.totals.unreadable_folders,
            scan.stats.skipped_links,
            scan.stats.hard_link_duplicates,
            gib(scan.stats.hard_link_bytes),
            scan.stats.cloud_only_files,
            gib(scan.stats.cloud_only_bytes),
        );
        for entry in list_children(&store, scan.id, ROOT, 12).unwrap().entries {
            println!("  {:>8.2} GiB  {}", gib(entry.allocated_bytes), entry.name);
        }
    }
}
