//! Leitura das pastas para o Espaço em disco — SOMENTE LEITURA.
//!
//! Lista o conteúdo de uma pasta de uma vez (`GetFileInformationByHandleEx`),
//! com o tamanho, o espaço em disco e o identificador de cada item. A pasta é
//! aberta só para listar (`FILE_LIST_DIRECTORY`); nenhum arquivo é aberto.
//!
//! Pastas com ponto de nova análise só são seguidas quando ele não é um link
//! (junção, link simbólico, ponto de montagem apontam para outro lugar). As
//! pastas do OneDrive têm um ponto de nova análise que não é link: o conteúdo
//! delas está nesta unidade e é somado.

use std::path::Path;

use crate::domain::disk_usage::{DirectoryLister, EntryKind, RawEntry};

/// Lê as pastas da unidade analisada.
pub struct VolumeLister;

impl DirectoryLister for VolumeLister {
    fn list(&self, path: &Path) -> Option<Vec<RawEntry>> {
        list_directory(path)
    }
}

/// Bit dos pontos de nova análise que são "outro nome" para algo em outro
/// lugar (`IsReparseTagNameSurrogate`): junções, links, pontos de montagem.
#[cfg_attr(not(windows), allow(dead_code))]
const REPARSE_TAG_NAME_SURROGATE: u32 = 0x2000_0000;

/// Ponto de nova análise que não deve ser seguido. Sem a marca (0), na dúvida,
/// também não.
#[cfg_attr(not(windows), allow(dead_code))]
fn is_link_tag(tag: u32) -> bool {
    tag == 0 || tag & REPARSE_TAG_NAME_SURROGATE != 0
}

#[cfg(windows)]
fn list_directory(path: &Path) -> Option<Vec<RawEntry>> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::{null, null_mut};

    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, ERROR_NO_MORE_FILES, INVALID_HANDLE_VALUE,
    };
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FileIdBothDirectoryInfo, FileIdBothDirectoryRestartInfo,
        GetFileInformationByHandleEx, FILE_ATTRIBUTE_DIRECTORY,
        FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS, FILE_ATTRIBUTE_REPARSE_POINT,
        FILE_FLAG_BACKUP_SEMANTICS, FILE_ID_BOTH_DIR_INFO, FILE_LIST_DIRECTORY, FILE_SHARE_DELETE,
        FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };

    /// Buffer de cada leitura (várias centenas de itens por chamada).
    const BUFFER_BYTES: usize = 64 * 1024;

    // Prefixo `\\?\`: caminhos com mais de 260 caracteres também abrem.
    let wide: Vec<u16> = OsStr::new(r"\\?\")
        .encode_wide()
        .chain(path.as_os_str().encode_wide())
        .chain(std::iter::once(0))
        .collect();
    // SAFETY: `wide` termina em 0. Abre a pasta só para listar, sem impedir
    // outros programas de ler, gravar ou excluir; BACKUP_SEMANTICS é o que
    // permite abrir pastas (sem privilégio de backup, é uma abertura comum).
    let handle = unsafe {
        CreateFileW(
            wide.as_ptr(),
            FILE_LIST_DIRECTORY,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return None;
    }

    // Buffer em u64: os registros começam em endereços múltiplos de 8.
    let mut buffer = vec![0u64; BUFFER_BYTES / 8];
    let mut entries = Vec::new();
    let mut class = FileIdBothDirectoryRestartInfo;
    let complete = loop {
        // SAFETY: `handle` é uma pasta aberta com FILE_LIST_DIRECTORY e o
        // buffer tem exatamente o tamanho informado.
        let ok = unsafe {
            GetFileInformationByHandleEx(
                handle,
                class,
                buffer.as_mut_ptr().cast(),
                BUFFER_BYTES as u32,
            )
        };
        if ok == 0 {
            // SAFETY: sem pré-condições.
            break unsafe { GetLastError() } == ERROR_NO_MORE_FILES;
        }
        class = FileIdBothDirectoryInfo;

        let base = buffer.as_ptr().cast::<u8>();
        let mut offset = 0usize;
        loop {
            // SAFETY: a API preencheu o buffer com registros encadeados por
            // `NextEntryOffset`, cada um alinhado e inteiro dentro do buffer.
            let record = unsafe { base.add(offset).cast::<FILE_ID_BOTH_DIR_INFO>() };
            let info = unsafe { &*record };
            let name_len = info.FileNameLength as usize / 2;
            // SAFETY: o nome (UTF-16, sem 0 final) segue o registro, com
            // `FileNameLength` bytes.
            let name = unsafe {
                std::slice::from_raw_parts(
                    std::ptr::addr_of!((*record).FileName).cast::<u16>(),
                    name_len,
                )
            };
            if name != [u16::from(b'.')] && name != [u16::from(b'.'), u16::from(b'.')] {
                let attributes = info.FileAttributes;
                let is_dir = attributes & FILE_ATTRIBUTE_DIRECTORY != 0;
                // Com ponto de nova análise, `EaSize` traz a marca dele.
                let is_link =
                    attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0 && is_link_tag(info.EaSize);
                let kind = match (is_link, is_dir) {
                    (true, _) => EntryKind::Link,
                    (false, true) => EntryKind::Folder,
                    (false, false) => EntryKind::File,
                };
                entries.push(RawEntry {
                    name: String::from_utf16_lossy(name),
                    kind,
                    bytes: u64::try_from(info.EndOfFile).unwrap_or(0),
                    allocated_bytes: u64::try_from(info.AllocationSize).unwrap_or(0),
                    modified_ms: filetime_to_unix_ms(info.LastWriteTime),
                    file_id: u64::try_from(info.FileId).ok().filter(|&id| id != 0),
                    cloud_only: attributes & FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS != 0,
                });
            }
            if info.NextEntryOffset == 0 {
                break;
            }
            offset += info.NextEntryOffset as usize;
        }
    };
    // SAFETY: `handle` foi aberto acima e não é usado depois.
    unsafe { CloseHandle(handle) };
    // Leitura interrompida no meio: somar só uma parte enganaria.
    complete.then_some(entries)
}

/// FILETIME (100 ns desde 1601) → milissegundos desde 1970. `None` sem data.
#[cfg(windows)]
fn filetime_to_unix_ms(filetime: i64) -> Option<i64> {
    const UNIX_EPOCH_AS_FILETIME: i64 = 116_444_736_000_000_000;
    (filetime > 0).then(|| (filetime - UNIX_EPOCH_AS_FILETIME) / 10_000)
}

/// Fora do Windows (só para compilar e testar): lê pelo `std::fs`, sem espaço
/// alocado nem identificadores.
#[cfg(not(windows))]
fn list_directory(path: &Path) -> Option<Vec<RawEntry>> {
    use std::time::UNIX_EPOCH;

    let entries = std::fs::read_dir(path).ok()?;
    Some(
        entries
            .flatten()
            .filter_map(|entry| {
                let metadata = entry.metadata().ok()?;
                let kind = if metadata.file_type().is_symlink() {
                    EntryKind::Link
                } else if metadata.is_dir() {
                    EntryKind::Folder
                } else {
                    EntryKind::File
                };
                Some(RawEntry {
                    name: entry.file_name().to_string_lossy().into_owned(),
                    kind,
                    bytes: metadata.len(),
                    allocated_bytes: metadata.len(),
                    modified_ms: metadata
                        .modified()
                        .ok()
                        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                        .and_then(|elapsed| i64::try_from(elapsed.as_millis()).ok()),
                    file_id: None,
                    cloud_only: false,
                })
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
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
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn find<'a>(entries: &'a [RawEntry], name: &str) -> &'a RawEntry {
        entries
            .iter()
            .find(|entry| entry.name == name)
            .unwrap_or_else(|| panic!("{name} não listado"))
    }

    #[test]
    fn lists_files_and_folders_with_their_sizes() {
        let dir = TestDir::new("disk-usage-list");
        fs::create_dir(dir.0.join("sub")).unwrap();
        fs::write(dir.0.join("grande.bin"), vec![b'x'; 100_000]).unwrap();
        fs::write(dir.0.join("vazio.txt"), b"").unwrap();

        let entries = VolumeLister.list(&dir.0).unwrap();
        assert_eq!(entries.len(), 3, "sem as entradas . e ..");
        assert_eq!(find(&entries, "sub").kind, EntryKind::Folder);
        let big = find(&entries, "grande.bin");
        assert_eq!(big.kind, EntryKind::File);
        assert_eq!(big.bytes, 100_000);
        // O espaço em disco é o tamanho arredondado para clusters.
        assert!(big.allocated_bytes >= 100_000, "{}", big.allocated_bytes);
        assert!(big.modified_ms.is_some_and(|ms| ms > 1_700_000_000_000));
        assert_eq!(find(&entries, "vazio.txt").bytes, 0);
    }

    #[test]
    fn missing_folders_cannot_be_read() {
        let dir = TestDir::new("disk-usage-missing");
        assert!(VolumeLister.list(&dir.0.join("nao-existe")).is_none());
    }

    #[test]
    fn handles_long_paths_and_many_entries() {
        let dir = TestDir::new("disk-usage-long");
        let mut deep = dir.0.clone();
        for _ in 0..12 {
            deep.push("pasta-com-um-nome-bem-comprido-para-passar-dos-260");
        }
        fs::create_dir_all(&deep).unwrap();
        // Mais itens do que cabem numa leitura só do buffer.
        for index in 0..2_000 {
            fs::write(deep.join(format!("arquivo-numero-{index:05}.txt")), b"x").unwrap();
        }
        assert!(deep.as_os_str().len() > 600);
        assert_eq!(VolumeLister.list(&deep).unwrap().len(), 2_000);
    }

    #[cfg(windows)]
    #[test]
    fn hard_links_share_the_file_id() {
        let dir = TestDir::new("disk-usage-hardlink");
        fs::write(dir.0.join("original.bin"), vec![b'x'; 10_000]).unwrap();
        fs::hard_link(dir.0.join("original.bin"), dir.0.join("copia.bin")).unwrap();
        fs::write(dir.0.join("outro.bin"), vec![b'x'; 10_000]).unwrap();

        let entries = VolumeLister.list(&dir.0).unwrap();
        let original = find(&entries, "original.bin").file_id;
        assert!(original.is_some());
        assert_eq!(find(&entries, "copia.bin").file_id, original);
        assert_ne!(find(&entries, "outro.bin").file_id, original);
    }

    #[cfg(windows)]
    #[test]
    fn junctions_are_links() {
        use crate::platform::cleanup::create_junction;

        let dir = TestDir::new("disk-usage-junction");
        let outside = TestDir::new("disk-usage-outside");
        assert!(
            create_junction(&dir.0.join("atalho"), &outside.0),
            "falha ao criar a junção"
        );
        let entries = VolumeLister.list(&dir.0).unwrap();
        assert_eq!(find(&entries, "atalho").kind, EntryKind::Link);
    }

    #[test]
    fn only_name_surrogates_are_links() {
        const MOUNT_POINT: u32 = 0xA000_0003;
        const SYMLINK: u32 = 0xA000_000C;
        const CLOUD: u32 = 0x9000_601A;
        const DEDUP: u32 = 0x8000_0013;
        assert!(is_link_tag(MOUNT_POINT));
        assert!(is_link_tag(SYMLINK));
        assert!(is_link_tag(0));
        assert!(!is_link_tag(CLOUD));
        assert!(!is_link_tag(DEDUP));
    }
}
