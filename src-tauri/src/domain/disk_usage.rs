//! Espaço em disco (como o WinDirStat): o que ocupa cada unidade — SOMENTE LEITURA.
//!
//! A análise percorre a unidade inteira e monta a árvore de pastas com o espaço
//! de cada uma. Esta parte é pura: recebe o que foi listado de cada pasta
//! (`platform::disk_usage`, que só lê nomes, tamanhos e datas) e soma, guarda e
//! lista. Nada vai para o banco; a última análise fica só em memória.
//!
//! - **Em disco** (`allocated_bytes`) é o espaço ocupado de fato; arquivos só na
//!   nuvem (OneDrive) têm tamanho, mas quase nada em disco.
//! - **Links físicos** (o mesmo arquivo em duas pastas, comum em
//!   `Windows\WinSxS`) contam uma vez só, na primeira pasta lida.
//! - Links simbólicos, junções e pontos de montagem **não são seguidos**:
//!   apontam para outro lugar, que seria contado duas vezes.
//! - Cada pasta guarda com nome só os `FILES_PER_FOLDER` maiores arquivos; os
//!   outros entram só na soma ("outros itens"), para a memória não crescer com
//!   centenas de milhares de arquivos pequenos. Os nomes ficam todos num texto
//!   só (`Names`), sem uma alocação por nome.

use std::cmp::{Ordering, Reverse};
use std::collections::{BinaryHeap, HashSet};
use std::path::Path;

use serde::Serialize;

/// Posição da pasta na árvore. A raiz é `ROOT`; uma pasta sempre tem id maior
/// que o da pasta que a contém.
pub type FolderId = u32;

pub const ROOT: FolderId = 0;

/// Arquivos guardados com nome em cada pasta (os maiores).
pub const FILES_PER_FOLDER: usize = 50;

/// Tamanho da lista "Maiores arquivos" da unidade.
pub const LARGEST_FILES: usize = 100;

/// Máximo de itens por listagem de pasta; o resto vem somado.
pub const CHILDREN_MAX: usize = 500;

const SEPARATOR: char = '\\';

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryKind {
    File,
    Folder,
    /// Link simbólico, junção ou ponto de montagem: nunca seguido.
    Link,
}

/// Um item como lido do SO.
#[derive(Debug, Clone)]
pub struct RawEntry {
    pub name: String,
    pub kind: EntryKind,
    /// Tamanho do conteúdo.
    pub bytes: u64,
    /// Espaço ocupado no disco (clusters alocados).
    pub allocated_bytes: u64,
    /// Última modificação, em milissegundos desde 1970.
    pub modified_ms: Option<i64>,
    /// Identificador no volume: links físicos do mesmo arquivo têm o mesmo.
    /// `None` quando o sistema de arquivos não informa um confiável.
    pub file_id: Option<u64>,
    /// Arquivo só na nuvem (OneDrive): não ocupa o disco até ser baixado.
    pub cloud_only: bool,
}

/// Lê o conteúdo de uma pasta: só nomes, tamanhos e datas, sem abrir arquivos.
pub trait DirectoryLister: Send + Sync {
    /// `None` se a pasta não pode ser lida (sem permissão, removida…).
    fn list(&self, path: &Path) -> Option<Vec<RawEntry>>;
}

/// Somas de uma pasta, incluindo tudo o que há dentro dela.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Totals {
    pub bytes: u64,
    pub allocated_bytes: u64,
    pub files: u64,
    /// Subpastas (em qualquer nível), sem contar a própria.
    pub folders: u64,
    /// Pastas que não puderam ser lidas, incluindo a própria.
    pub unreadable_folders: u64,
    /// Modificação mais recente entre os arquivos.
    pub modified_ms: Option<i64>,
}

impl Totals {
    fn add(&mut self, other: &Totals) {
        self.bytes += other.bytes;
        self.allocated_bytes += other.allocated_bytes;
        self.files += other.files;
        self.folders += other.folders;
        self.unreadable_folders += other.unreadable_folders;
        self.modified_ms = self.modified_ms.max(other.modified_ms);
    }
}

/// Contagens de itens que não entram (ou entram de forma especial) nas somas.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStats {
    /// Links, junções e pontos de montagem ignorados.
    pub skipped_links: u64,
    /// Nomes repetidos de arquivos com links físicos (contados uma vez só).
    pub hard_link_duplicates: u64,
    pub hard_link_bytes: u64,
    /// Arquivos só na nuvem: `cloud_only_bytes` é o tamanho deles, não o espaço em disco.
    pub cloud_only_files: u64,
    pub cloud_only_bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiskEntryKind {
    Folder,
    File,
}

/// Uma linha da árvore.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskEntry {
    /// Só pastas: o id para listar o conteúdo.
    pub folder_id: Option<FolderId>,
    pub name: String,
    pub kind: DiskEntryKind,
    pub bytes: u64,
    pub allocated_bytes: u64,
    /// Só pastas: arquivos dentro dela (em qualquer nível).
    pub files: Option<u64>,
    pub modified_ms: Option<i64>,
    /// Pasta que não pôde ser lida (o conteúdo dela não foi somado).
    pub unreadable: bool,
    /// Pasta com algo dentro para mostrar.
    pub has_children: bool,
}

/// O que passou do limite de uma listagem, somado.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HiddenItems {
    pub count: u64,
    pub bytes: u64,
    pub allocated_bytes: u64,
}

/// Conteúdo de uma pasta, maiores primeiro.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderChildren {
    /// Caminho da pasta (ex.: "C:\Users").
    pub path: String,
    pub entries: Vec<DiskEntry>,
    /// Itens menores que ficaram de fora da lista (`None` se nenhum).
    pub rest: Option<HiddenItems>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LargeFile {
    pub path: String,
    pub bytes: u64,
    pub allocated_bytes: u64,
    pub modified_ms: Option<i64>,
}

/// Nomes de todas as pastas e arquivos guardados, um atrás do outro.
#[derive(Debug, Default)]
struct Names(String);

/// Posição de um nome em `Names`.
#[derive(Debug, Clone, Copy)]
struct Name {
    start: u32,
    len: u32,
}

impl Names {
    fn push(&mut self, name: &str) -> Name {
        match (u32::try_from(self.0.len()), u32::try_from(name.len())) {
            (Ok(start), Ok(len)) if start.checked_add(len).is_some() => {
                self.0.push_str(name);
                Name { start, len }
            }
            // Mais de 4 GB de nomes: não acontece numa unidade real.
            _ => Name { start: 0, len: 0 },
        }
    }

    fn get(&self, name: Name) -> &str {
        let start = name.start as usize;
        self.0.get(start..start + name.len as usize).unwrap_or("")
    }
}

#[derive(Debug)]
struct FileEntry {
    name: Name,
    bytes: u64,
    allocated_bytes: u64,
    modified_ms: Option<i64>,
}

#[derive(Debug)]
struct Folder {
    name: Name,
    parent: Option<FolderId>,
    /// Depois de `finish`, maiores primeiro.
    subfolders: Vec<FolderId>,
    /// Maiores primeiro, até `FILES_PER_FOLDER`.
    files: Vec<FileEntry>,
    /// Arquivos além dos guardados: só somados.
    other_files: HiddenItems,
    unreadable: bool,
    /// Preenchido em `finish`.
    totals: Totals,
}

impl Folder {
    fn new(name: Name, parent: Option<FolderId>) -> Self {
        Self {
            name,
            parent,
            subfolders: Vec::new(),
            files: Vec::new(),
            other_files: HiddenItems::default(),
            unreadable: false,
            totals: Totals::default(),
        }
    }
}

/// Candidato a "maiores arquivos", ordenado pelo espaço em disco.
#[derive(Debug, PartialEq, Eq)]
struct Candidate {
    allocated_bytes: u64,
    bytes: u64,
    folder: FolderId,
    name: Box<str>,
    modified_ms: Option<i64>,
}

impl Ord for Candidate {
    fn cmp(&self, other: &Self) -> Ordering {
        (self.allocated_bytes, self.bytes)
            .cmp(&(other.allocated_bytes, other.bytes))
            // Empate: o nome menor fica na frente (ordem estável).
            .then_with(|| other.name.cmp(&self.name))
            .then_with(|| other.folder.cmp(&self.folder))
    }
}

impl PartialOrd for Candidate {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Andamento da montagem da árvore.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct BuildProgress {
    pub files: u64,
    pub folders: u64,
    pub allocated_bytes: u64,
}

/// Monta a árvore à medida que as pastas são lidas.
pub struct DiskTreeBuilder {
    folders: Vec<Folder>,
    names: Names,
    /// `None` quando o sistema de arquivos não tem identificadores confiáveis.
    seen_file_ids: Option<HashSet<u64>>,
    largest: BinaryHeap<Reverse<Candidate>>,
    stats: ScanStats,
    progress: BuildProgress,
}

impl DiskTreeBuilder {
    /// `root_path` é o nome da raiz (ex.: "C:\"). `track_hard_links` só vale
    /// para sistemas de arquivos com identificador único por arquivo (NTFS).
    pub fn new(root_path: &str, track_hard_links: bool) -> Self {
        let mut names = Names::default();
        let root = names.push(root_path);
        Self {
            folders: vec![Folder::new(root, None)],
            names,
            seen_file_ids: track_hard_links.then(HashSet::new),
            largest: BinaryHeap::with_capacity(LARGEST_FILES + 1),
            stats: ScanStats::default(),
            progress: BuildProgress::default(),
        }
    }

    pub fn progress(&self) -> BuildProgress {
        self.progress
    }

    /// Guarda o conteúdo lido de `folder` e devolve as subpastas a percorrer.
    pub fn add_listing(
        &mut self,
        folder: FolderId,
        entries: Vec<RawEntry>,
    ) -> Vec<(FolderId, String)> {
        let mut subfolders = Vec::new();
        let mut files = Vec::new();
        for entry in entries {
            match entry.kind {
                EntryKind::Link => self.stats.skipped_links += 1,
                EntryKind::Folder => {
                    let id = self.folders.len() as FolderId;
                    let name = self.names.push(&entry.name);
                    self.folders.push(Folder::new(name, Some(folder)));
                    self.progress.folders += 1;
                    subfolders.push((id, entry.name));
                }
                EntryKind::File => {
                    if let (Some(seen), Some(file_id)) =
                        (self.seen_file_ids.as_mut(), entry.file_id)
                    {
                        if !seen.insert(file_id) {
                            self.stats.hard_link_duplicates += 1;
                            self.stats.hard_link_bytes += entry.allocated_bytes;
                            continue;
                        }
                    }
                    if entry.cloud_only {
                        self.stats.cloud_only_files += 1;
                        self.stats.cloud_only_bytes += entry.bytes;
                    }
                    self.progress.files += 1;
                    self.progress.allocated_bytes += entry.allocated_bytes;
                    self.offer_largest(folder, &entry);
                    files.push(entry);
                }
            }
        }

        files.sort_by(|a: &RawEntry, b: &RawEntry| {
            (b.allocated_bytes, b.bytes)
                .cmp(&(a.allocated_bytes, a.bytes))
                .then_with(|| a.name.cmp(&b.name))
        });
        let mut other_files = HiddenItems::default();
        for file in files.drain(FILES_PER_FOLDER.min(files.len())..) {
            other_files.count += 1;
            other_files.bytes += file.bytes;
            other_files.allocated_bytes += file.allocated_bytes;
            // A data ainda conta para a modificação mais recente da pasta.
            let target = &mut self.folders[folder as usize];
            target.totals.modified_ms = target.totals.modified_ms.max(file.modified_ms);
        }
        // Vetor novo do tamanho exato: um `collect` reaproveitaria o buffer
        // dos `RawEntry` (maior), que ficaria preso na árvore.
        let mut kept = Vec::with_capacity(files.len());
        kept.extend(files.into_iter().map(|file| FileEntry {
            name: self.names.push(&file.name),
            bytes: file.bytes,
            allocated_bytes: file.allocated_bytes,
            modified_ms: file.modified_ms,
        }));
        let target = &mut self.folders[folder as usize];
        target.files = kept;
        target.other_files = other_files;
        target
            .subfolders
            .extend(subfolders.iter().map(|&(id, _)| id));
        subfolders
    }

    /// A pasta não pôde ser lida: fica na árvore, sem conteúdo.
    pub fn mark_unreadable(&mut self, folder: FolderId) {
        self.folders[folder as usize].unreadable = true;
    }

    fn offer_largest(&mut self, folder: FolderId, file: &RawEntry) {
        // Menor que o menor da lista cheia: nem monta o candidato.
        if self.largest.len() >= LARGEST_FILES
            && self.largest.peek().is_some_and(|Reverse(smallest)| {
                (file.allocated_bytes, file.bytes) < (smallest.allocated_bytes, smallest.bytes)
            })
        {
            return;
        }
        let candidate = Candidate {
            allocated_bytes: file.allocated_bytes,
            bytes: file.bytes,
            folder,
            name: file.name.as_str().into(),
            modified_ms: file.modified_ms,
        };
        if self.largest.len() < LARGEST_FILES {
            self.largest.push(Reverse(candidate));
        } else if self
            .largest
            .peek()
            .is_some_and(|Reverse(smallest)| candidate > *smallest)
        {
            self.largest.pop();
            self.largest.push(Reverse(candidate));
        }
    }

    /// Soma cada pasta com tudo o que há dentro dela e ordena as listas.
    pub fn finish(self) -> DiskTree {
        let Self {
            mut folders,
            mut names,
            largest,
            stats,
            ..
        } = self;
        names.0.shrink_to_fit();

        // A pasta filha sempre tem id maior: de trás para frente, cada pasta já
        // recebeu as somas das filhas quando chega a vez dela.
        for index in (0..folders.len()).rev() {
            let folder = &mut folders[index];
            let totals = &mut folder.totals;
            for file in &folder.files {
                totals.bytes += file.bytes;
                totals.allocated_bytes += file.allocated_bytes;
                totals.modified_ms = totals.modified_ms.max(file.modified_ms);
            }
            totals.bytes += folder.other_files.bytes;
            totals.allocated_bytes += folder.other_files.allocated_bytes;
            totals.files += folder.files.len() as u64 + folder.other_files.count;
            totals.folders += folder.subfolders.len() as u64;
            totals.unreadable_folders += u64::from(folder.unreadable);
            let totals = *totals;
            if let Some(parent) = folder.parent {
                folders[parent as usize].totals.add(&totals);
            }
        }

        for index in 0..folders.len() {
            let mut subfolders = std::mem::take(&mut folders[index].subfolders);
            subfolders.sort_by(|&a, &b| {
                let (a, b) = (&folders[a as usize], &folders[b as usize]);
                (b.totals.allocated_bytes, b.totals.bytes)
                    .cmp(&(a.totals.allocated_bytes, a.totals.bytes))
                    .then_with(|| names.get(a.name).cmp(names.get(b.name)))
            });
            folders[index].subfolders = subfolders;
        }

        let mut tree = DiskTree {
            folders,
            names,
            largest: Vec::new(),
            stats,
        };
        tree.largest = largest
            .into_sorted_vec()
            .into_iter()
            .map(|Reverse(candidate)| LargeFile {
                path: join(&tree.path(candidate.folder), &candidate.name),
                bytes: candidate.bytes,
                allocated_bytes: candidate.allocated_bytes,
                modified_ms: candidate.modified_ms,
            })
            .collect();
        tree
    }
}

fn join(folder: &str, name: &str) -> String {
    if folder.ends_with(SEPARATOR) {
        format!("{folder}{name}")
    } else {
        format!("{folder}{SEPARATOR}{name}")
    }
}

/// Árvore pronta de uma análise.
#[derive(Debug)]
pub struct DiskTree {
    folders: Vec<Folder>,
    names: Names,
    /// Maiores primeiro.
    largest: Vec<LargeFile>,
    stats: ScanStats,
}

impl DiskTree {
    pub fn totals(&self) -> Totals {
        self.folders[ROOT as usize].totals
    }

    pub fn stats(&self) -> ScanStats {
        self.stats
    }

    pub fn largest_files(&self) -> &[LargeFile] {
        &self.largest
    }

    /// Caminho completo da pasta (ex.: "C:\Users\bruno").
    pub fn path(&self, id: FolderId) -> String {
        let mut names = Vec::new();
        let mut current = Some(id);
        while let Some(index) = current {
            let folder = &self.folders[index as usize];
            names.push(self.names.get(folder.name));
            current = folder.parent;
        }
        names.into_iter().rev().fold(String::new(), |path, name| {
            if path.is_empty() {
                name.to_owned()
            } else {
                join(&path, name)
            }
        })
    }

    /// A linha de uma pasta (`None` se o id não existe).
    pub fn entry(&self, id: FolderId) -> Option<DiskEntry> {
        let folder = self.folders.get(id as usize)?;
        Some(DiskEntry {
            folder_id: Some(id),
            name: self.names.get(folder.name).to_owned(),
            kind: DiskEntryKind::Folder,
            bytes: folder.totals.bytes,
            allocated_bytes: folder.totals.allocated_bytes,
            files: Some(folder.totals.files),
            modified_ms: folder.totals.modified_ms,
            unreadable: folder.unreadable,
            has_children: !folder.subfolders.is_empty()
                || !folder.files.is_empty()
                || folder.other_files.count > 0,
        })
    }

    /// Conteúdo da pasta, maiores primeiro: até `limit` itens e o resto somado.
    pub fn children(&self, id: FolderId, limit: usize) -> Option<FolderChildren> {
        let folder = self.folders.get(id as usize)?;
        let mut entries: Vec<DiskEntry> = folder
            .subfolders
            .iter()
            .filter_map(|&child| self.entry(child))
            .chain(folder.files.iter().map(|file| DiskEntry {
                folder_id: None,
                name: self.names.get(file.name).to_owned(),
                kind: DiskEntryKind::File,
                bytes: file.bytes,
                allocated_bytes: file.allocated_bytes,
                files: None,
                modified_ms: file.modified_ms,
                unreadable: false,
                has_children: false,
            }))
            .collect();
        entries.sort_by(|a, b| {
            (b.allocated_bytes, b.bytes)
                .cmp(&(a.allocated_bytes, a.bytes))
                .then_with(|| a.name.cmp(&b.name))
        });

        let mut rest = folder.other_files;
        for hidden in entries.drain(limit.min(entries.len())..) {
            rest.count += 1;
            rest.bytes += hidden.bytes;
            rest.allocated_bytes += hidden.allocated_bytes;
        }
        Some(FolderChildren {
            path: self.path(id),
            entries,
            rest: (rest.count > 0).then_some(rest),
        })
    }
}

/// Espaço em uso na unidade que a análise não encontrou em nenhuma pasta:
/// pastas sem acesso, arquivos internos do sistema de arquivos, pontos de
/// restauração… Nunca negativo.
pub fn unaccounted_bytes(volume_used_bytes: u64, scanned_allocated_bytes: u64) -> u64 {
    volume_used_bytes.saturating_sub(scanned_allocated_bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(name: &str, allocated: u64) -> RawEntry {
        RawEntry {
            name: name.into(),
            kind: EntryKind::File,
            bytes: allocated.saturating_sub(10),
            allocated_bytes: allocated,
            modified_ms: Some(allocated as i64),
            file_id: None,
            cloud_only: false,
        }
    }

    fn folder(name: &str) -> RawEntry {
        RawEntry {
            kind: EntryKind::Folder,
            bytes: 0,
            allocated_bytes: 0,
            modified_ms: Some(9_999_999),
            ..file(name, 0)
        }
    }

    fn with_id(entry: RawEntry, id: u64) -> RawEntry {
        RawEntry {
            file_id: Some(id),
            ..entry
        }
    }

    /// Adiciona e devolve o id da subpasta `name` que acabou de ser listada.
    fn add(
        builder: &mut DiskTreeBuilder,
        folder: FolderId,
        entries: Vec<RawEntry>,
    ) -> Vec<FolderId> {
        builder
            .add_listing(folder, entries)
            .into_iter()
            .map(|(id, _)| id)
            .collect()
    }

    fn names(children: &FolderChildren) -> Vec<&str> {
        children
            .entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect()
    }

    /// C:\ → Users (bruno: foto 300, doc 50), Windows (sys 500), pagefile 1000.
    fn sample() -> DiskTree {
        let mut builder = DiskTreeBuilder::new("C:\\", true);
        let top = add(
            &mut builder,
            ROOT,
            vec![
                folder("Users"),
                folder("Windows"),
                file("pagefile.sys", 1000),
            ],
        );
        let users = add(&mut builder, top[0], vec![folder("bruno")]);
        add(
            &mut builder,
            users[0],
            vec![file("doc.txt", 50), file("foto.jpg", 300)],
        );
        add(&mut builder, top[1], vec![file("sys.dll", 500)]);
        builder.finish()
    }

    #[test]
    fn sums_every_folder_with_everything_inside() {
        let tree = sample();
        let totals = tree.totals();
        assert_eq!(totals.allocated_bytes, 1850);
        assert_eq!(totals.bytes, 1850 - 40);
        assert_eq!(totals.files, 4);
        assert_eq!(totals.folders, 3);
        assert_eq!(totals.modified_ms, Some(1000));

        let root = tree.children(ROOT, CHILDREN_MAX).unwrap();
        assert_eq!(root.path, "C:\\");
        assert_eq!(names(&root), ["pagefile.sys", "Windows", "Users"]);
        let users = &root.entries[2];
        assert_eq!(users.allocated_bytes, 350);
        assert_eq!(users.files, Some(2));
        assert!(users.has_children);
        // A data da pasta é a do arquivo mais recente, não a da própria pasta.
        assert_eq!(users.modified_ms, Some(300));
    }

    #[test]
    fn builds_the_path_of_each_folder() {
        let tree = sample();
        let users = tree.children(ROOT, CHILDREN_MAX).unwrap().entries[2]
            .folder_id
            .unwrap();
        let bruno = tree.children(users, CHILDREN_MAX).unwrap();
        assert_eq!(bruno.path, "C:\\Users");
        let inside = tree
            .children(bruno.entries[0].folder_id.unwrap(), CHILDREN_MAX)
            .unwrap();
        assert_eq!(inside.path, "C:\\Users\\bruno");
        assert_eq!(names(&inside), ["foto.jpg", "doc.txt"]);
    }

    #[test]
    fn lists_the_largest_files_of_the_drive_with_their_path() {
        let tree = sample();
        let paths: Vec<&str> = tree
            .largest_files()
            .iter()
            .map(|file| file.path.as_str())
            .collect();
        assert_eq!(
            paths,
            [
                "C:\\pagefile.sys",
                "C:\\Windows\\sys.dll",
                "C:\\Users\\bruno\\foto.jpg",
                "C:\\Users\\bruno\\doc.txt"
            ]
        );
    }

    #[test]
    fn keeps_only_the_largest_files_overall() {
        let mut builder = DiskTreeBuilder::new("C:\\", false);
        let entries = (1..=(LARGEST_FILES as u64 + 20))
            .map(|size| file(&format!("f{size}"), size))
            .collect();
        add(&mut builder, ROOT, entries);
        let tree = builder.finish();
        let largest = tree.largest_files();
        assert_eq!(largest.len(), LARGEST_FILES);
        assert_eq!(largest[0].allocated_bytes, LARGEST_FILES as u64 + 20);
        assert_eq!(largest[LARGEST_FILES - 1].allocated_bytes, 21);
    }

    #[test]
    fn hard_links_count_once() {
        let mut builder = DiskTreeBuilder::new("C:\\", true);
        let top = add(
            &mut builder,
            ROOT,
            vec![folder("System32"), folder("WinSxS")],
        );
        add(
            &mut builder,
            top[0],
            vec![with_id(file("kernel.dll", 400), 7)],
        );
        add(
            &mut builder,
            top[1],
            vec![
                with_id(file("kernel.dll", 400), 7),
                with_id(file("outro.dll", 20), 8),
            ],
        );
        let tree = builder.finish();
        assert_eq!(tree.totals().allocated_bytes, 420);
        assert_eq!(tree.totals().files, 2);
        let stats = tree.stats();
        assert_eq!(
            (stats.hard_link_duplicates, stats.hard_link_bytes),
            (1, 400)
        );
        assert_eq!(tree.largest_files().len(), 2);
    }

    #[test]
    fn without_reliable_ids_the_same_id_is_not_a_hard_link() {
        let mut builder = DiskTreeBuilder::new("E:\\", false);
        add(
            &mut builder,
            ROOT,
            vec![with_id(file("a", 10), 1), with_id(file("b", 10), 1)],
        );
        assert_eq!(builder.finish().totals().allocated_bytes, 20);
    }

    #[test]
    fn links_are_skipped_and_counted() {
        let mut builder = DiskTreeBuilder::new("C:\\", true);
        let link = RawEntry {
            kind: EntryKind::Link,
            ..folder("Documents and Settings")
        };
        let top = add(&mut builder, ROOT, vec![link, folder("Users")]);
        assert_eq!(top.len(), 1);
        let tree = builder.finish();
        assert_eq!(tree.stats().skipped_links, 1);
        assert_eq!(
            names(&tree.children(ROOT, CHILDREN_MAX).unwrap()),
            ["Users"]
        );
    }

    #[test]
    fn cloud_only_files_are_counted_by_size_but_occupy_what_the_disk_says() {
        let mut builder = DiskTreeBuilder::new("C:\\", true);
        let cloud = RawEntry {
            bytes: 5_000,
            allocated_bytes: 0,
            cloud_only: true,
            ..file("video.mp4", 0)
        };
        add(&mut builder, ROOT, vec![cloud, file("local.txt", 100)]);
        let tree = builder.finish();
        assert_eq!(tree.totals().allocated_bytes, 100);
        assert_eq!(
            (tree.stats().cloud_only_files, tree.stats().cloud_only_bytes),
            (1, 5_000)
        );
    }

    #[test]
    fn unreadable_folders_stay_in_the_tree_without_content() {
        let mut builder = DiskTreeBuilder::new("C:\\", true);
        let top = add(
            &mut builder,
            ROOT,
            vec![folder("System Volume Information"), file("a", 10)],
        );
        builder.mark_unreadable(top[0]);
        let tree = builder.finish();
        assert_eq!(tree.totals().unreadable_folders, 1);
        let root = tree.children(ROOT, CHILDREN_MAX).unwrap();
        let locked = root
            .entries
            .iter()
            .find(|entry| entry.name == "System Volume Information")
            .unwrap();
        assert!(locked.unreadable);
        assert!(!locked.has_children);
        assert_eq!(locked.allocated_bytes, 0);
    }

    #[test]
    fn a_folder_keeps_only_its_largest_files_by_name_and_sums_the_rest() {
        let mut builder = DiskTreeBuilder::new("C:\\", false);
        let count = FILES_PER_FOLDER as u64 + 5;
        let entries = (1..=count)
            .map(|size| file(&format!("f{size}"), size))
            .collect();
        add(&mut builder, ROOT, entries);
        let tree = builder.finish();
        assert_eq!(tree.totals().files, count);
        assert_eq!(tree.totals().allocated_bytes, count * (count + 1) / 2);
        // A data mais recente vem também dos arquivos que não ficaram com nome.
        assert_eq!(tree.totals().modified_ms, Some(count as i64));

        let root = tree.children(ROOT, CHILDREN_MAX).unwrap();
        assert_eq!(root.entries.len(), FILES_PER_FOLDER);
        assert_eq!(
            root.rest,
            Some(HiddenItems {
                count: 5,
                bytes: 0,
                allocated_bytes: 15,
            })
        );
    }

    #[test]
    fn a_listing_is_limited_and_the_rest_comes_summed() {
        let tree = sample();
        let root = tree.children(ROOT, 1).unwrap();
        assert_eq!(names(&root), ["pagefile.sys"]);
        let rest = root.rest.unwrap();
        assert_eq!((rest.count, rest.allocated_bytes), (2, 850));
        assert_eq!(rest.bytes, 850 - 20 - 10);
        assert!(tree.children(ROOT, CHILDREN_MAX).unwrap().rest.is_none());
    }

    #[test]
    fn unknown_folders_are_not_found() {
        let tree = sample();
        assert!(tree.children(99, CHILDREN_MAX).is_none());
        assert!(tree.entry(99).is_none());
        assert_eq!(tree.entry(ROOT).unwrap().name, "C:\\");
    }

    #[test]
    fn unaccounted_space_is_never_negative() {
        assert_eq!(unaccounted_bytes(1000, 700), 300);
        assert_eq!(unaccounted_bytes(700, 1000), 0);
    }
}
