//! Execução da limpeza — o ÚNICO módulo de `platform` que remove algo.
//!
//! Só é chamado por `services::optimization::run_cleanup`, com um plano
//! confirmado pelo usuário e feito de itens da última análise (os caminhos
//! nunca vêm da tela). Antes de remover cada arquivo, confere de novo:
//! - nenhuma pasta entre a pasta de origem e o arquivo é link ou junção (uma
//!   junção trocada depois da análise poderia apontar para fora da allowlist);
//! - o arquivo não é link e tem o mesmo tamanho e a mesma data de modificação
//!   da análise.
//!
//! Pastas só são removidas quando ficam vazias com as remoções (`remove_dir`
//! falha se houver conteúdo), e nunca a pasta de origem. A Lixeira é esvaziada
//! pela API do Windows (`SHEmptyRecycleBinW`), unidade por unidade, só se
//! estiver igual à análise. Nada de shell, elevação ou mudança de atributos:
//! o que o usuário comum não pode apagar fica onde está.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::domain::optimization::{CleanupExecutor, CleanupItem, RemovalOutcome};
use crate::platform::cleanup::{
    current_user_sid, is_link, read_recycle_bin, recycle_bin_folder, unix_ms,
};

pub struct FileSystemExecutor {
    /// Unidades fixas ("C:", "D:") cuja Lixeira foi analisada.
    drives: Vec<String>,
    /// Pastas já conferidas nesta execução (existem e não são links).
    verified: HashSet<PathBuf>,
    /// Pastas que tiveram arquivos removidos → pasta de origem delas.
    touched: HashMap<PathBuf, PathBuf>,
}

impl FileSystemExecutor {
    pub fn new(drives: Vec<String>) -> Self {
        Self {
            drives,
            verified: HashSet::new(),
            touched: HashMap::new(),
        }
    }

    /// Confere cada pasta de `root` até `parent` (inclusive): precisa existir e
    /// não pode ser link.
    fn check_folders(&mut self, root: &Path, parent: &Path) -> Result<(), RemovalOutcome> {
        let relative = parent
            .strip_prefix(root)
            .map_err(|_| RemovalOutcome::Refused)?;
        let mut current = root.to_path_buf();
        let mut chain = vec![current.clone()];
        for part in relative.components() {
            current.push(part);
            chain.push(current.clone());
        }
        for folder in chain {
            if self.verified.contains(&folder) {
                continue;
            }
            let metadata = fs::symlink_metadata(&folder).map_err(|error| classify(&error))?;
            if is_link(&metadata) || !metadata.is_dir() {
                return Err(RemovalOutcome::Changed);
            }
            self.verified.insert(folder);
        }
        Ok(())
    }
}

/// Erro do Windows ao remover → motivo exibido.
fn classify(error: &io::Error) -> RemovalOutcome {
    const ERROR_SHARING_VIOLATION: i32 = 32;
    const ERROR_LOCK_VIOLATION: i32 = 33;
    if let Some(ERROR_SHARING_VIOLATION | ERROR_LOCK_VIOLATION) = error.raw_os_error() {
        return RemovalOutcome::InUse;
    }
    match error.kind() {
        io::ErrorKind::NotFound => RemovalOutcome::Missing,
        io::ErrorKind::PermissionDenied => RemovalOutcome::Denied,
        _ => RemovalOutcome::Failed,
    }
}

impl CleanupExecutor for FileSystemExecutor {
    fn remove_file(&mut self, folder: &str, item: &CleanupItem) -> RemovalOutcome {
        let root = Path::new(folder);
        let path = Path::new(&item.path);
        let Some(parent) = path.parent() else {
            return RemovalOutcome::Refused;
        };
        if let Err(outcome) = self.check_folders(root, parent) {
            return outcome;
        }
        let metadata = match fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(error) => return classify(&error),
        };
        let unchanged = !is_link(&metadata)
            && metadata.is_file()
            && metadata.len() == item.bytes
            && metadata.modified().ok().and_then(unix_ms) == item.date_ms;
        if !unchanged {
            return RemovalOutcome::Changed;
        }
        match fs::remove_file(path) {
            Ok(()) => {
                self.touched
                    .insert(parent.to_path_buf(), root.to_path_buf());
                RemovalOutcome::Removed
            }
            Err(error) => classify(&error),
        }
    }

    fn remove_emptied_folders(&mut self) {
        let mut touched: Vec<(PathBuf, PathBuf)> = self.touched.drain().collect();
        // Mais profundas primeiro, para as mães ficarem vazias antes.
        touched.sort_by_key(|(folder, _)| std::cmp::Reverse(folder.components().count()));
        for (mut folder, root) in touched {
            while folder != root && folder.starts_with(&root) {
                let plain = fs::symlink_metadata(&folder)
                    .is_ok_and(|metadata| metadata.is_dir() && !is_link(&metadata));
                // `remove_dir` só remove pasta vazia; com conteúdo, para aqui.
                if plain && fs::remove_dir(&folder).is_err() {
                    break;
                }
                if !folder.pop() {
                    break;
                }
            }
        }
        // As pastas conferidas podem ter sido removidas.
        self.verified.clear();
    }

    fn empty_recycle_bin(&mut self, expected: &[CleanupItem]) -> RemovalOutcome {
        let Some(sid) = current_user_sid() else {
            return RemovalOutcome::Failed;
        };
        let mut current = Vec::new();
        let mut drives_with_items = Vec::new();
        for drive in &self.drives {
            let Some((items, unreadable)) = read_recycle_bin(&recycle_bin_folder(drive, &sid))
            else {
                continue;
            };
            // Um registro ilegível seria apagado sem ter sido mostrado.
            if unreadable > 0 {
                return RemovalOutcome::Refused;
            }
            if !items.is_empty() {
                drives_with_items.push(drive.clone());
            }
            current.extend(items);
        }
        if current.is_empty() {
            return RemovalOutcome::Missing;
        }
        let key = |item: &CleanupItem| (item.path.clone(), item.bytes, item.date_ms);
        let mut current: Vec<_> = current.iter().map(key).collect();
        let mut expected: Vec<_> = expected.iter().map(key).collect();
        current.sort();
        expected.sort();
        if current != expected {
            return RemovalOutcome::Changed;
        }
        for drive in drives_with_items {
            if !empty_drive_recycle_bin(&drive) {
                return RemovalOutcome::Failed;
            }
        }
        RemovalOutcome::Removed
    }
}

/// Esvazia a Lixeira de uma unidade, sem confirmação, progresso ou som do
/// Windows (a confirmação é a do app).
#[cfg(windows)]
fn empty_drive_recycle_bin(drive: &str) -> bool {
    use std::ptr::null_mut;

    use windows_sys::Win32::UI::Shell::{
        SHEmptyRecycleBinW, SHERB_NOCONFIRMATION, SHERB_NOPROGRESSUI, SHERB_NOSOUND,
    };

    let root: Vec<u16> = format!("{drive}\\")
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    // SAFETY: `root` termina em 0 e vive até o fim da chamada; sem janela dona.
    let result = unsafe {
        SHEmptyRecycleBinW(
            null_mut(),
            root.as_ptr(),
            SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND,
        )
    };
    result >= 0
}

#[cfg(not(windows))]
fn empty_drive_recycle_bin(_drive: &str) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use std::fs::File;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    /// Pasta temporária exclusiva do teste, apagada ao final.
    struct TestDir(PathBuf);

    impl TestDir {
        fn new(name: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!("zdc-{name}-{nanos}"));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn root(&self) -> String {
            self.0.to_string_lossy().into_owned()
        }

        /// Cria o arquivo e devolve o item como a análise o veria.
        fn file(&self, relative: &str, bytes: usize) -> CleanupItem {
            let path = self.0.join(relative);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, vec![b'x'; bytes]).unwrap();
            let metadata = fs::metadata(&path).unwrap();
            CleanupItem {
                path: path.to_string_lossy().into_owned(),
                bytes: metadata.len(),
                date_ms: metadata.modified().ok().and_then(unix_ms),
            }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn removes_unchanged_files_and_emptied_folders_but_keeps_the_root() {
        let dir = TestDir::new("exec-remove");
        let deep = dir.file("instalador\\sub\\a.tmp", 10);
        let kept = dir.file("outro\\b.tmp", 10);
        dir.file("outro\\fica.tmp", 1);
        let mut executor = FileSystemExecutor::new(Vec::new());

        assert_eq!(
            executor.remove_file(&dir.root(), &deep),
            RemovalOutcome::Removed
        );
        assert_eq!(
            executor.remove_file(&dir.root(), &kept),
            RemovalOutcome::Removed
        );
        executor.remove_emptied_folders();

        assert!(!Path::new(&deep.path).exists());
        assert!(!dir.0.join("instalador").exists());
        // Pasta com outro arquivo (não planejado) continua.
        assert!(dir.0.join("outro\\fica.tmp").exists());
        assert!(dir.0.exists());
    }

    #[test]
    fn keeps_files_that_changed_since_the_analysis() {
        let dir = TestDir::new("exec-changed");
        let item = dir.file("a.tmp", 10);
        fs::write(&item.path, b"conteudo novo e maior").unwrap();
        let mut executor = FileSystemExecutor::new(Vec::new());

        assert_eq!(
            executor.remove_file(&dir.root(), &item),
            RemovalOutcome::Changed
        );
        assert!(Path::new(&item.path).exists());

        let mut touched = dir.file("b.tmp", 10);
        touched.date_ms = touched.date_ms.map(|ms| ms - 60_000);
        assert_eq!(
            executor.remove_file(&dir.root(), &touched),
            RemovalOutcome::Changed
        );
        assert!(Path::new(&touched.path).exists());
    }

    #[test]
    fn missing_files_are_reported_as_missing() {
        let dir = TestDir::new("exec-missing");
        let item = dir.file("a.tmp", 10);
        fs::remove_file(&item.path).unwrap();
        let mut executor = FileSystemExecutor::new(Vec::new());
        assert_eq!(
            executor.remove_file(&dir.root(), &item),
            RemovalOutcome::Missing
        );
    }

    #[test]
    fn refuses_files_outside_the_folder() {
        let dir = TestDir::new("exec-outside");
        let other = TestDir::new("exec-outside-other");
        let item = other.file("importante.txt", 10);
        let mut executor = FileSystemExecutor::new(Vec::new());
        assert_eq!(
            executor.remove_file(&dir.root(), &item),
            RemovalOutcome::Refused
        );
        assert!(Path::new(&item.path).exists());
    }

    #[cfg(windows)]
    #[test]
    fn files_open_by_another_program_are_in_use() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = TestDir::new("exec-in-use");
        let item = dir.file("aberto.tmp", 10);
        // Sem compartilhamento, como um programa que trava o arquivo.
        let _open = File::options()
            .read(true)
            .share_mode(0)
            .open(&item.path)
            .unwrap();
        let mut executor = FileSystemExecutor::new(Vec::new());
        assert_eq!(
            executor.remove_file(&dir.root(), &item),
            RemovalOutcome::InUse
        );
    }

    #[cfg(windows)]
    #[test]
    fn a_link_in_the_path_stops_the_removal() {
        let dir = TestDir::new("exec-link");
        let outside = TestDir::new("exec-link-outside");
        let target = outside.file("importante.txt", 10);
        // Depois da análise, a pasta "cache" vira uma junção para fora.
        let link = dir.0.join("cache");
        assert!(
            crate::platform::cleanup::create_junction(&link, &outside.0),
            "falha ao criar a junção"
        );
        let item = CleanupItem {
            path: link.join("importante.txt").to_string_lossy().into_owned(),
            ..target.clone()
        };
        let mut executor = FileSystemExecutor::new(Vec::new());
        assert_eq!(
            executor.remove_file(&dir.root(), &item),
            RemovalOutcome::Changed
        );
        assert!(Path::new(&target.path).exists());
    }

    #[test]
    fn classifies_windows_errors() {
        assert_eq!(
            classify(&io::Error::from_raw_os_error(32)),
            RemovalOutcome::InUse
        );
        assert_eq!(
            classify(&io::Error::from(io::ErrorKind::PermissionDenied)),
            RemovalOutcome::Denied
        );
        assert_eq!(
            classify(&io::Error::from(io::ErrorKind::NotFound)),
            RemovalOutcome::Missing
        );
        assert_eq!(classify(&io::Error::other("disco")), RemovalOutcome::Failed);
    }

    #[test]
    fn recycle_bin_is_not_emptied_when_it_differs_from_the_analysis() {
        // Um item que certamente não está na Lixeira: o conteúdo real difere
        // (ou a Lixeira está vazia) e nada é apagado.
        let mut executor = FileSystemExecutor::new(vec!["C:".into()]);
        let outcome = executor.empty_recycle_bin(&[CleanupItem {
            path: "Z:\\nao-existe-zdc.txt".into(),
            bytes: 1,
            date_ms: Some(1),
        }]);
        assert!(
            matches!(
                outcome,
                RemovalOutcome::Changed | RemovalOutcome::Missing | RemovalOutcome::Refused
            ),
            "{outcome:?}"
        );
    }
}
