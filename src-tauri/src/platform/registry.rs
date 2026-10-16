//! Leitura do registro do Windows — SOMENTE LEITURA (chaves abertas com
//! `KEY_READ`; nenhuma função aqui grava).

use std::ptr::{null, null_mut};

use windows_sys::Win32::Foundation::{
    ERROR_FILE_NOT_FOUND, ERROR_MORE_DATA, ERROR_NO_MORE_ITEMS, ERROR_PATH_NOT_FOUND,
    ERROR_SUCCESS, WIN32_ERROR,
};
use windows_sys::Win32::System::Registry::{
    RegCloseKey, RegEnumKeyExW, RegEnumValueW, RegGetValueW, RegOpenKeyExW, HKEY,
    HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, REG_BINARY, REG_DWORD, REG_EXPAND_SZ, REG_SZ,
    RRF_RT_REG_BINARY, RRF_RT_REG_DWORD, RRF_RT_REG_SZ,
};

/// Maior nome de valor do registro (16 383 caracteres + o nulo).
const MAX_VALUE_NAME: usize = 16_384;
/// Maior nome de chave (255 caracteres + o nulo).
const MAX_KEY_NAME: usize = 256;

#[derive(Debug, Clone, Copy)]
pub enum Hive {
    CurrentUser,
    LocalMachine,
}

impl Hive {
    fn handle(self) -> HKEY {
        match self {
            Self::CurrentUser => HKEY_CURRENT_USER,
            Self::LocalMachine => HKEY_LOCAL_MACHINE,
        }
    }
}

/// Valor lido de uma enumeração.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RegValue {
    Text(String),
    /// `REG_EXPAND_SZ`: o texto ainda com as `%VARIÁVEIS%`.
    ExpandText(String),
    Binary(Vec<u8>),
    Dword(u32),
    Other,
}

pub fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Texto UTF-16 até o primeiro nulo.
pub fn from_wide(buffer: &[u16]) -> String {
    let end = buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..end])
}

fn text_from_bytes(bytes: &[u8]) -> String {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect();
    from_wide(&units)
}

fn not_found(code: WIN32_ERROR) -> bool {
    code == ERROR_FILE_NOT_FOUND || code == ERROR_PATH_NOT_FOUND
}

/// Chave aberta só para leitura; fechada ao sair de escopo.
pub struct RegKey(HKEY);

impl Drop for RegKey {
    fn drop(&mut self) {
        // SAFETY: a chave foi aberta por `open` e é fechada uma única vez.
        unsafe { RegCloseKey(self.0) };
    }
}

/// `Ok(None)` se a chave não existe; `Err(código)` para outras falhas (ex.: acesso negado).
pub fn open(hive: Hive, path: &str) -> Result<Option<RegKey>, WIN32_ERROR> {
    let path = wide(path);
    let mut key: HKEY = null_mut();
    // SAFETY: `path` termina em nulo e `key` recebe o handle.
    let result = unsafe { RegOpenKeyExW(hive.handle(), path.as_ptr(), 0, KEY_READ, &mut key) };
    match result {
        ERROR_SUCCESS => Ok(Some(RegKey(key))),
        code if not_found(code) => Ok(None),
        code => Err(code),
    }
}

/// A chave existe? `None` se não deu para saber.
pub fn exists(hive: Hive, path: &str) -> Option<bool> {
    open(hive, path).ok().map(|key| key.is_some())
}

impl RegKey {
    pub fn subkey(&self, path: &str) -> Result<Option<RegKey>, WIN32_ERROR> {
        let path = wide(path);
        let mut key: HKEY = null_mut();
        // SAFETY: `self.0` está aberta; `path` termina em nulo.
        let result = unsafe { RegOpenKeyExW(self.0, path.as_ptr(), 0, KEY_READ, &mut key) };
        match result {
            ERROR_SUCCESS => Ok(Some(RegKey(key))),
            code if not_found(code) => Ok(None),
            code => Err(code),
        }
    }

    /// Lê um valor com `RegGetValueW` (o tipo é conferido pela API).
    fn get(&self, name: &str, flags: u32) -> Result<Option<Vec<u8>>, WIN32_ERROR> {
        let name = wide(name);
        let mut size = 0u32;
        // SAFETY: primeira chamada só consulta o tamanho (buffer nulo).
        let result = unsafe {
            RegGetValueW(
                self.0,
                null(),
                name.as_ptr(),
                flags,
                null_mut(),
                null_mut(),
                &mut size,
            )
        };
        match result {
            ERROR_SUCCESS => {}
            code if not_found(code) => return Ok(None),
            code => return Err(code),
        }
        loop {
            let mut buffer = vec![0u8; size as usize];
            // SAFETY: `buffer` tem exatamente `size` bytes.
            let result = unsafe {
                RegGetValueW(
                    self.0,
                    null(),
                    name.as_ptr(),
                    flags,
                    null_mut(),
                    buffer.as_mut_ptr().cast(),
                    &mut size,
                )
            };
            match result {
                ERROR_SUCCESS => {
                    buffer.truncate(size as usize);
                    return Ok(Some(buffer));
                }
                // O valor cresceu entre as chamadas: tenta com o tamanho novo.
                ERROR_MORE_DATA => continue,
                code if not_found(code) => return Ok(None),
                code => return Err(code),
            }
        }
    }

    pub fn dword(&self, name: &str) -> Result<Option<u32>, WIN32_ERROR> {
        Ok(self.get(name, RRF_RT_REG_DWORD)?.and_then(|bytes| {
            let bytes: [u8; 4] = bytes.get(..4)?.try_into().ok()?;
            Some(u32::from_le_bytes(bytes))
        }))
    }

    pub fn binary(&self, name: &str) -> Result<Option<Vec<u8>>, WIN32_ERROR> {
        self.get(name, RRF_RT_REG_BINARY)
    }

    /// Texto (`REG_EXPAND_SZ` já expandido pela API).
    pub fn text(&self, name: &str) -> Result<Option<String>, WIN32_ERROR> {
        Ok(self
            .get(name, RRF_RT_REG_SZ)?
            .map(|bytes| text_from_bytes(&bytes)))
    }

    /// Todos os valores da chave (nome, valor).
    pub fn values(&self) -> Result<Vec<(String, RegValue)>, WIN32_ERROR> {
        let mut values = Vec::new();
        let mut name = vec![0u16; MAX_VALUE_NAME];
        let mut data = vec![0u8; 4096];
        let mut index = 0u32;
        loop {
            let mut name_len = name.len() as u32;
            let mut data_len = data.len() as u32;
            let mut kind = 0u32;
            // SAFETY: os tamanhos informados são os dos buffers.
            let result = unsafe {
                RegEnumValueW(
                    self.0,
                    index,
                    name.as_mut_ptr(),
                    &mut name_len,
                    null(),
                    &mut kind,
                    data.as_mut_ptr(),
                    &mut data_len,
                )
            };
            match result {
                ERROR_SUCCESS => {}
                ERROR_NO_MORE_ITEMS => return Ok(values),
                ERROR_MORE_DATA => {
                    // Dado maior que o buffer: aumenta e lê o mesmo índice de novo.
                    data.resize((data_len as usize).max(data.len() * 2), 0);
                    continue;
                }
                code => return Err(code),
            }
            let bytes = &data[..data_len as usize];
            let value = match kind {
                REG_SZ => RegValue::Text(text_from_bytes(bytes)),
                REG_EXPAND_SZ => RegValue::ExpandText(text_from_bytes(bytes)),
                REG_BINARY => RegValue::Binary(bytes.to_vec()),
                REG_DWORD if bytes.len() >= 4 => {
                    RegValue::Dword(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
                }
                _ => RegValue::Other,
            };
            values.push((String::from_utf16_lossy(&name[..name_len as usize]), value));
            index += 1;
        }
    }

    /// Nomes das subchaves.
    pub fn subkeys(&self) -> Result<Vec<String>, WIN32_ERROR> {
        let mut names = Vec::new();
        let mut name = vec![0u16; MAX_KEY_NAME];
        let mut index = 0u32;
        loop {
            let mut name_len = name.len() as u32;
            // SAFETY: o tamanho informado é o do buffer; classe e data não são pedidas.
            let result = unsafe {
                RegEnumKeyExW(
                    self.0,
                    index,
                    name.as_mut_ptr(),
                    &mut name_len,
                    null(),
                    null_mut(),
                    null_mut(),
                    null_mut(),
                )
            };
            match result {
                ERROR_SUCCESS => {
                    names.push(String::from_utf16_lossy(&name[..name_len as usize]));
                    index += 1;
                }
                ERROR_NO_MORE_ITEMS => return Ok(names),
                code => return Err(code),
            }
        }
    }
}
