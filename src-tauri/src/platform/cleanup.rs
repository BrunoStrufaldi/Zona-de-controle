//! Análise da limpeza — SOMENTE LEITURA.
//!
//! Percorre só as pastas da allowlist (`domain::optimization`), lendo nomes,
//! tamanhos e datas: nenhum arquivo é aberto para escrita, movido ou apagado.
//! Links simbólicos, junções e outros pontos de nova análise (como os arquivos
//! só na nuvem do OneDrive) são ignorados, então a leitura nunca sai da pasta
//! de origem. A Lixeira é lida pelos registros `$I` do usuário atual em cada
//! unidade fixa.

use std::fs::{self, Metadata};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::domain::optimization::{
    is_recent, parse_recycle_info, CleanupAnalyzer, CleanupItem, CleanupSource, FileFilter,
    KnownRoot, ScannedSource, SourceLayout, CHROMIUM_PROFILE_CACHES, CHROMIUM_PROFILE_MARKER,
    CHROMIUM_SHARED_CACHES, FIREFOX_CACHE,
};
use crate::error::AppResult;

/// Um registro `$I` tem menos de 600 bytes; algo muito maior não é um deles.
const RECYCLE_INFO_MAX_BYTES: u64 = 64 * 1024;

pub struct FileSystemAnalyzer {
    /// AppData\Local do usuário (pasta conhecida do Windows).
    local_app_data: PathBuf,
    /// Unidades fixas ("C:", "D:") onde procurar a Lixeira.
    drives: Vec<String>,
}

impl FileSystemAnalyzer {
    pub fn new(local_app_data: PathBuf, drives: Vec<String>) -> Self {
        Self {
            local_app_data,
            drives,
        }
    }

    fn root(&self, root: KnownRoot) -> Option<PathBuf> {
        match root {
            KnownRoot::LocalAppData => Some(self.local_app_data.clone()),
            KnownRoot::LocalAppDataLow => self
                .local_app_data
                .parent()
                .map(|app_data| app_data.join("LocalLow")),
        }
    }

    fn scan_source(&self, source: CleanupSource, now: SystemTime) -> ScannedSource {
        let mut scanned = ScannedSource::new(source);
        let min_age = source.min_age();
        match source.layout() {
            SourceLayout::Folders(rules) => {
                for rule in rules {
                    if let Some(base) = self.root(rule.root) {
                        let folder = join(&base, rule.path);
                        scan_folder(&folder, rule.filter, min_age, now, &mut scanned);
                    }
                }
            }
            SourceLayout::Chromium { user_data } => {
                let user_data = join(&self.local_app_data, user_data);
                for name in CHROMIUM_SHARED_CACHES {
                    let folder = user_data.join(name);
                    scan_folder(&folder, FileFilter::Everything, min_age, now, &mut scanned);
                }
                for profile in subfolders(&user_data) {
                    if !profile.join(CHROMIUM_PROFILE_MARKER).is_file() {
                        continue;
                    }
                    for name in CHROMIUM_PROFILE_CACHES {
                        let folder = profile.join(name);
                        scan_folder(&folder, FileFilter::Everything, min_age, now, &mut scanned);
                    }
                }
            }
            SourceLayout::Firefox { profiles } => {
                for profile in subfolders(&join(&self.local_app_data, profiles)) {
                    let folder = profile.join(FIREFOX_CACHE);
                    scan_folder(&folder, FileFilter::Everything, min_age, now, &mut scanned);
                }
            }
            SourceLayout::RecycleBin => scan_recycle_bin(&self.drives, &mut scanned),
        }
        scanned
    }
}

impl CleanupAnalyzer for FileSystemAnalyzer {
    fn analyze(&self) -> AppResult<Vec<ScannedSource>> {
        let now = SystemTime::now();
        Ok(CleanupSource::ALL
            .iter()
            .map(|&source| self.scan_source(source, now))
            .collect())
    }
}

fn join(base: &Path, parts: &[&str]) -> PathBuf {
    parts
        .iter()
        .fold(base.to_path_buf(), |path, part| path.join(part))
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// Milissegundos desde 1970 (a mesma conversão na análise e na limpeza, para
/// comparar a data de modificação).
pub(crate) fn unix_ms(time: SystemTime) -> Option<i64> {
    let elapsed = time.duration_since(UNIX_EPOCH).ok()?;
    i64::try_from(elapsed.as_millis()).ok()
}

/// Link simbólico, junção ou outro ponto de nova análise: nunca é seguido.
pub(crate) fn is_link(metadata: &Metadata) -> bool {
    metadata.file_type().is_symlink() || is_reparse_point(metadata)
}

#[cfg(windows)]
fn is_reparse_point(metadata: &Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn is_reparse_point(_metadata: &Metadata) -> bool {
    false
}

/// Subpastas reais (sem links) de `folder`, em ordem alfabética.
fn subfolders(folder: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(folder) else {
        return Vec::new();
    };
    let mut folders: Vec<PathBuf> = entries
        .flatten()
        .filter(|entry| {
            entry
                .metadata()
                .is_ok_and(|metadata| metadata.is_dir() && !is_link(&metadata))
        })
        .map(|entry| entry.path())
        .collect();
    folders.sort();
    folders
}

/// Soma os arquivos de `folder` que passam no filtro. Pasta inexistente não
/// entra em `folders`; pasta que é link é ignorada inteira.
fn scan_folder(
    folder: &Path,
    filter: FileFilter,
    min_age: Option<Duration>,
    now: SystemTime,
    out: &mut ScannedSource,
) {
    let Ok(metadata) = fs::symlink_metadata(folder) else {
        return;
    };
    if is_link(&metadata) {
        out.ignored_count += 1;
        return;
    }
    if !metadata.is_dir() {
        return;
    }
    out.folders.push(display(folder));

    // Pilha em vez de recursão: pastas muito profundas não estouram a pilha.
    let mut pending = vec![folder.to_path_buf()];
    while let Some(dir) = pending.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            out.ignored_count += 1;
            continue;
        };
        for entry in entries {
            // No Windows, `DirEntry::metadata` não segue links.
            let Ok((path, metadata)) =
                entry.and_then(|entry| entry.metadata().map(|metadata| (entry.path(), metadata)))
            else {
                out.ignored_count += 1;
                continue;
            };
            if is_link(&metadata) {
                out.ignored_count += 1;
            } else if metadata.is_dir() {
                if filter.recursive() {
                    pending.push(path);
                }
            } else if metadata.is_file() {
                let name = path.file_name().map(|name| name.to_string_lossy());
                if !name.is_some_and(|name| filter.matches(&name)) {
                    continue;
                }
                let bytes = metadata.len();
                let modified = metadata.modified().ok();
                if min_age.is_some_and(|min_age| {
                    is_recent(metadata.created().ok(), modified, now, min_age)
                }) {
                    out.recent_count += 1;
                    out.recent_bytes += bytes;
                    continue;
                }
                out.items.push(CleanupItem {
                    path: display(&path),
                    bytes,
                    date_ms: modified.and_then(unix_ms),
                });
            }
        }
    }
}

/// Itens da Lixeira do usuário atual (`X:\$Recycle.Bin\<SID>`) em cada unidade.
fn scan_recycle_bin(drives: &[String], out: &mut ScannedSource) {
    let Some(sid) = current_user_sid() else {
        return;
    };
    for drive in drives {
        let folder = recycle_bin_folder(drive, &sid);
        let Some((items, ignored)) = read_recycle_bin(&folder) else {
            continue;
        };
        out.folders.push(display(&folder));
        out.items.extend(items);
        out.ignored_count += ignored;
    }
}

/// Pasta da Lixeira do usuário `sid` na unidade `drive` ("C:").
pub(crate) fn recycle_bin_folder(drive: &str, sid: &str) -> PathBuf {
    PathBuf::from(format!("{drive}\\$Recycle.Bin\\{sid}"))
}

/// Itens de uma pasta da Lixeira e quantos registros não puderam ser lidos.
/// `None` se a pasta não existe ou não abre.
pub(crate) fn read_recycle_bin(folder: &Path) -> Option<(Vec<CleanupItem>, u64)> {
    let entries = fs::read_dir(folder).ok()?;
    let mut items = Vec::new();
    let mut ignored = 0;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some(suffix) = name.strip_prefix("$I") else {
            continue;
        };
        // O conteúdo fica no `$R` de mesmo sufixo; sem ele, o Windows não
        // mostra o item na Lixeira.
        if fs::symlink_metadata(folder.join(format!("$R{suffix}"))).is_err() {
            continue;
        }
        let entry = entry
            .metadata()
            .ok()
            .filter(|metadata| metadata.is_file() && metadata.len() <= RECYCLE_INFO_MAX_BYTES)
            .and_then(|_| fs::read(entry.path()).ok())
            .and_then(|data| parse_recycle_info(&data));
        match entry {
            Some(entry) => items.push(CleanupItem {
                path: entry.original_path,
                bytes: entry.bytes,
                date_ms: entry.deleted_at_ms,
            }),
            None => ignored += 1,
        }
    }
    Some((items, ignored))
}

/// `true` se o app está rodando como administrador (elevado). A limpeza se
/// recusa a rodar assim: ela nunca deve ter mais poder que o usuário comum.
#[cfg(windows)]
pub fn is_elevated() -> bool {
    use std::ptr::null_mut;

    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::Security::{
        GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
    };
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    let mut token: HANDLE = null_mut();
    // SAFETY: o pseudo-handle do processo atual é sempre válido.
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 {
        // Sem saber, trata como elevado: a limpeza fica bloqueada.
        return true;
    }
    let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
    let mut size = 0u32;
    // SAFETY: `elevation` tem exatamente o tamanho informado.
    let ok = unsafe {
        GetTokenInformation(
            token,
            TokenElevation,
            (&mut elevation as *mut TOKEN_ELEVATION).cast(),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut size,
        )
    };
    // SAFETY: `token` foi aberto acima e não é usado depois.
    unsafe { CloseHandle(token) };
    ok == 0 || elevation.TokenIsElevated != 0
}

#[cfg(not(windows))]
pub fn is_elevated() -> bool {
    false
}

/// SID do usuário do processo (ex.: "S-1-5-21-…"), nome da pasta dele na Lixeira.
#[cfg(windows)]
pub(crate) fn current_user_sid() -> Option<String> {
    use std::ptr::null_mut;

    use windows_sys::core::PWSTR;
    use windows_sys::Win32::Foundation::{CloseHandle, LocalFree, HANDLE};
    use windows_sys::Win32::Security::Authorization::ConvertSidToStringSidW;
    use windows_sys::Win32::Security::{GetTokenInformation, TokenUser, TOKEN_QUERY, TOKEN_USER};
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    let mut token: HANDLE = null_mut();
    // SAFETY: o pseudo-handle do processo atual é sempre válido; `token` recebe o handle.
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 {
        return None;
    }
    let mut size = 0u32;
    // SAFETY: consulta só o tamanho necessário (buffer nulo com tamanho 0).
    unsafe { GetTokenInformation(token, TokenUser, null_mut(), 0, &mut size) };
    // Buffer em u64 para respeitar o alinhamento do TOKEN_USER.
    let mut buffer = vec![0u64; (size as usize).div_ceil(8)];
    // SAFETY: o buffer tem pelo menos `size` bytes.
    let ok = unsafe {
        GetTokenInformation(
            token,
            TokenUser,
            buffer.as_mut_ptr().cast(),
            size,
            &mut size,
        )
    };
    // SAFETY: `token` foi aberto acima e não é usado depois.
    unsafe { CloseHandle(token) };
    if ok == 0 || buffer.is_empty() {
        return None;
    }
    // SAFETY: a API preencheu o buffer (alinhado) com um TOKEN_USER; o SID
    // apontado vive dentro dele.
    let sid = unsafe { (*buffer.as_ptr().cast::<TOKEN_USER>()).User.Sid };
    let mut text: PWSTR = null_mut();
    // SAFETY: `sid` é válido; a API aloca `text`, liberado com LocalFree.
    if unsafe { ConvertSidToStringSidW(sid, &mut text) } == 0 || text.is_null() {
        return None;
    }
    // SAFETY: `text` termina em 0 e continua alocado até o LocalFree.
    let value = unsafe {
        let length = (0..).take_while(|&index| *text.add(index) != 0).count();
        String::from_utf16_lossy(std::slice::from_raw_parts(text, length))
    };
    // SAFETY: memória alocada pela ConvertSidToStringSidW.
    unsafe { LocalFree(text.cast()) };
    Some(value)
}

#[cfg(not(windows))]
pub(crate) fn current_user_sid() -> Option<String> {
    None
}

/// Só para testes: cria uma junção de pasta (ao contrário dos links
/// simbólicos, não exige administrador nem o Modo de Desenvolvedor). Usa o
/// `mklink` do Windows; o app em si nunca executa comandos.
#[cfg(all(test, windows))]
pub(crate) fn create_junction(link: &Path, target: &Path) -> bool {
    std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(link)
        .arg(target)
        .output()
        .is_ok_and(|output| output.status.success())
}

#[cfg(test)]
mod tests {
    use std::fs::File;

    use super::*;

    const DAY: Duration = Duration::from_secs(24 * 60 * 60);

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

        fn file(&self, parts: &[&str], bytes: usize) -> PathBuf {
            let path = join(&self.0, parts);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, vec![b'x'; bytes]).unwrap();
            path
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    /// Volta a data de criação e de modificação do arquivo.
    #[cfg(windows)]
    fn backdate(path: &Path, age: Duration) {
        use std::fs::FileTimes;
        use std::os::windows::fs::FileTimesExt;
        let past = SystemTime::now() - age;
        let file = File::options().write(true).open(path).unwrap();
        file.set_times(FileTimes::new().set_modified(past).set_created(past))
            .unwrap();
    }

    fn scan(dir: &TestDir, source: CleanupSource) -> ScannedSource {
        FileSystemAnalyzer::new(dir.0.clone(), Vec::new()).scan_source(source, SystemTime::now())
    }

    fn file_names(scanned: &ScannedSource) -> Vec<String> {
        let mut names: Vec<String> = scanned
            .items
            .iter()
            .map(|item| {
                Path::new(&item.path)
                    .strip_prefix(&scanned.folders[0])
                    .map_or_else(|_| item.path.clone(), display)
            })
            .collect();
        names.sort();
        names
    }

    #[cfg(windows)]
    #[test]
    fn temp_files_younger_than_a_day_stay_out() {
        let dir = TestDir::new("cleanup-temp");
        let old = dir.file(&["Temp", "instalador", "antigo.tmp"], 100);
        backdate(&old, DAY * 2);
        dir.file(&["Temp", "novo.tmp"], 7);
        // Extraído agora de um pacote antigo: só a modificação é antiga.
        let extracted = dir.file(&["Temp", "extraido.dll"], 3);
        let file = File::options().write(true).open(&extracted).unwrap();
        file.set_modified(SystemTime::now() - DAY * 400).unwrap();

        let scanned = scan(&dir, CleanupSource::UserTemp);
        assert_eq!(file_names(&scanned), ["instalador\\antigo.tmp"]);
        assert_eq!(scanned.items[0].bytes, 100);
        assert!(scanned.items[0].date_ms.is_some());
        assert_eq!((scanned.recent_count, scanned.recent_bytes), (2, 10));
    }

    #[test]
    fn caches_have_no_minimum_age() {
        let dir = TestDir::new("cleanup-cache");
        dir.file(&["D3DSCache", "abc", "shader.dxcache"], 10);
        dir.file(&["D3DSCache", "def.dxcache"], 5);

        let scanned = scan(&dir, CleanupSource::DirectXShaders);
        assert_eq!(scanned.folders.len(), 1);
        assert_eq!(file_names(&scanned), ["abc\\shader.dxcache", "def.dxcache"]);
        assert_eq!(scanned.recent_count, 0);
    }

    #[test]
    fn named_rules_only_take_matching_files_in_the_folder() {
        let dir = TestDir::new("cleanup-thumbs");
        dir.file(
            &["Microsoft", "Windows", "Explorer", "thumbcache_256.db"],
            4,
        );
        dir.file(&["Microsoft", "Windows", "Explorer", "iconcache_256.db"], 4);
        dir.file(
            &[
                "Microsoft",
                "Windows",
                "Explorer",
                "sub",
                "thumbcache_32.db",
            ],
            4,
        );

        let scanned = scan(&dir, CleanupSource::Thumbnails);
        assert_eq!(file_names(&scanned), ["thumbcache_256.db"]);
    }

    #[test]
    fn chromium_reads_only_the_cache_folders_of_real_profiles() {
        let dir = TestDir::new("cleanup-chrome");
        let user_data = ["Google", "Chrome", "User Data"];
        let at = |parts: &[&'static str]| -> Vec<&'static str> {
            user_data.iter().chain(parts).copied().collect()
        };
        dir.file(&at(&["Default", "Preferences"]), 1);
        dir.file(&at(&["Default", "Cache", "Cache_Data", "f_000001"]), 10);
        dir.file(&at(&["Default", "Code Cache", "js", "index"]), 20);
        dir.file(&at(&["Default", "Cookies"]), 99);
        dir.file(&at(&["Default", "History"]), 99);
        dir.file(&at(&["GrShaderCache", "data_0"]), 30);
        // Sem `Preferences`: não é perfil.
        dir.file(&at(&["Crashpad", "Cache", "x"]), 99);

        let scanned = scan(&dir, CleanupSource::Chrome);
        assert_eq!(scanned.folders.len(), 3);
        let total: u64 = scanned.items.iter().map(|item| item.bytes).sum();
        assert_eq!(total, 60);
    }

    #[test]
    fn missing_folders_are_not_found() {
        let dir = TestDir::new("cleanup-missing");
        let scanned = scan(&dir, CleanupSource::AmdShaders);
        assert!(scanned.folders.is_empty());
        assert!(scanned.items.is_empty());
        assert_eq!(scanned.ignored_count, 0);
    }

    #[cfg(windows)]
    #[test]
    fn links_are_never_followed() {
        let dir = TestDir::new("cleanup-links");
        let outside = TestDir::new("cleanup-outside");
        outside.file(&["importante.txt"], 50);
        dir.file(&["D3DSCache", "shader.dxcache"], 5);
        // Junção dentro do cache apontando para fora dele.
        let link = join(&dir.0, &["D3DSCache", "atalho"]);
        assert!(
            create_junction(&link, &outside.0),
            "falha ao criar a junção"
        );

        let scanned = scan(&dir, CleanupSource::DirectXShaders);
        assert_eq!(file_names(&scanned), ["shader.dxcache"]);
        assert_eq!(scanned.ignored_count, 1);
    }

    #[test]
    fn analyzes_every_source_of_this_machine_in_order() {
        let Some(local) = std::env::var_os("LOCALAPPDATA") else {
            return;
        };
        let analyzer = FileSystemAnalyzer::new(PathBuf::from(local), vec!["C:".into()]);
        let result = analyzer.analyze().unwrap();
        let sources: Vec<_> = result.iter().map(|scanned| scanned.source).collect();
        assert_eq!(sources, CleanupSource::ALL);
    }

    #[cfg(windows)]
    #[test]
    fn reads_the_current_user_sid() {
        let sid = current_user_sid().unwrap();
        assert!(sid.starts_with("S-1-5-"), "{sid}");
    }
}
