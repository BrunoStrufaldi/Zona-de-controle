//! Leitor das tabelas SMBIOS (o que `GetSystemFirmwareTable('RSMB')` devolve).
//!
//! Lê só o necessário: BIOS (tipo 0), placa-mãe (tipo 2) e módulos de memória
//! (tipo 17). **Nunca** lê números de série, etiquetas de patrimônio ou o UUID:
//! os campos ficam de fora das structs, então não há como vazarem para a tela,
//! o log ou os testes.

use serde::Serialize;

use crate::domain::calendar::CalendarDate;

/// Cabeçalho do `RawSMBIOSData` do Windows antes das tabelas.
const RAW_HEADER_LEN: usize = 8;

const TYPE_BIOS: u8 = 0;
const TYPE_BASEBOARD: u8 = 2;
const TYPE_MEMORY_DEVICE: u8 = 17;
const TYPE_END_OF_TABLE: u8 = 127;

/// Textos que os fabricantes deixam nos campos não preenchidos.
const PLACEHOLDERS: [&str; 7] = [
    "unknown",
    "not specified",
    "to be filled by o.e.m.",
    "default string",
    "none",
    "undefined",
    "not available",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BiosInfo {
    pub vendor: Option<String>,
    pub version: Option<String>,
    /// `aaaa-mm-dd`; `None` se a data não pôde ser lida.
    pub release_date: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardInfo {
    pub manufacturer: Option<String>,
    pub product: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MemoryKind {
    Ddr3,
    Ddr4,
    Ddr5,
    Lpddr4,
    Lpddr5,
}

impl MemoryKind {
    fn from_code(code: u8) -> Option<Self> {
        match code {
            0x18 => Some(Self::Ddr3),
            0x1A => Some(Self::Ddr4),
            0x1E => Some(Self::Lpddr4),
            0x22 => Some(Self::Ddr5),
            0x23 => Some(Self::Lpddr5),
            _ => None,
        }
    }
}

/// Um módulo de memória instalado (slots vazios ficam de fora).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryModule {
    /// Nome do slot na placa (ex.: "DIMM_A2").
    pub locator: Option<String>,
    pub manufacturer: Option<String>,
    pub part_number: Option<String>,
    pub kind: Option<MemoryKind>,
    pub size_bytes: Option<u64>,
    /// Velocidade máxima informada pelo módulo, em MT/s.
    pub max_speed_mts: Option<u32>,
    /// Velocidade em que a placa configurou o módulo, em MT/s.
    pub configured_speed_mts: Option<u32>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SmbiosInfo {
    pub bios: Option<BiosInfo>,
    pub board: Option<BoardInfo>,
    pub memory: Vec<MemoryModule>,
}

/// Uma estrutura: a parte formatada (com o cabeçalho de 4 bytes) e os textos.
struct Structure<'a> {
    kind: u8,
    formatted: &'a [u8],
    strings: Vec<&'a [u8]>,
}

impl Structure<'_> {
    fn byte(&self, offset: usize) -> Option<u8> {
        self.formatted.get(offset).copied()
    }

    fn word(&self, offset: usize) -> Option<u16> {
        let bytes = self.formatted.get(offset..offset + 2)?;
        Some(u16::from_le_bytes([bytes[0], bytes[1]]))
    }

    fn dword(&self, offset: usize) -> Option<u32> {
        let bytes = self.formatted.get(offset..offset + 4)?;
        Some(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    /// Texto apontado pelo byte em `offset` (índice 1-based; 0 = sem texto).
    fn string(&self, offset: usize) -> Option<String> {
        let index = usize::from(self.byte(offset)?);
        let raw = self.strings.get(index.checked_sub(1)?)?;
        clean_text(&String::from_utf8_lossy(raw))
    }
}

fn clean_text(value: &str) -> Option<String> {
    let trimmed = value.trim().trim_matches('\0').trim();
    if trimmed.is_empty() || PLACEHOLDERS.contains(&trimmed.to_lowercase().as_str()) {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Separa as estruturas da área de tabelas. Para na primeira inconsistência
/// (tamanho impossível ou sem o par de zeros final), mantendo as já lidas.
fn structures(tables: &[u8]) -> Vec<Structure<'_>> {
    let mut found = Vec::new();
    let mut offset = 0;
    while offset + 4 <= tables.len() {
        let kind = tables[offset];
        let length = usize::from(tables[offset + 1]);
        if length < 4 || offset + length > tables.len() {
            break;
        }
        let formatted = &tables[offset..offset + length];
        // Área de textos: termina em dois zeros seguidos.
        let text_start = offset + length;
        let Some(end) = tables[text_start..]
            .windows(2)
            .position(|pair| pair == [0, 0])
        else {
            break;
        };
        let text_area = &tables[text_start..text_start + end];
        let strings = if text_area.is_empty() {
            Vec::new()
        } else {
            text_area.split(|byte| *byte == 0).collect()
        };
        found.push(Structure {
            kind,
            formatted,
            strings,
        });
        if kind == TYPE_END_OF_TABLE {
            break;
        }
        offset = text_start + end + 2;
    }
    found
}

/// Data da BIOS no formato do SMBIOS: `mm/dd/aaaa` (ou `mm/dd/aa`).
pub fn parse_bios_date(value: &str) -> Option<CalendarDate> {
    let mut parts = value.trim().split('/');
    let month: u32 = parts.next()?.trim().parse().ok()?;
    let day: u32 = parts.next()?.trim().parse().ok()?;
    let year_text = parts.next()?.trim();
    if parts.next().is_some() {
        return None;
    }
    let year: i32 = year_text.parse().ok()?;
    let year = match year_text.len() {
        4 => year,
        // Anos de 2 dígitos (SMBIOS antigos): 80–99 são do século passado.
        2 if year >= 80 => 1900 + year,
        2 => 2000 + year,
        _ => return None,
    };
    CalendarDate::parse(&format!("{year:04}-{month:02}-{day:02}"))
}

fn bios(structure: &Structure<'_>) -> BiosInfo {
    BiosInfo {
        vendor: structure.string(0x04),
        version: structure.string(0x05),
        release_date: structure
            .string(0x08)
            .and_then(|date| parse_bios_date(&date))
            .map(|date| date.to_string()),
    }
}

fn board(structure: &Structure<'_>) -> BoardInfo {
    BoardInfo {
        manufacturer: structure.string(0x04),
        product: structure.string(0x05),
    }
}

/// Velocidade em MT/s: 0 = desconhecida; 0xFFFF = valor no campo estendido.
fn speed(structure: &Structure<'_>, offset: usize, extended_offset: usize) -> Option<u32> {
    match structure.word(offset)? {
        0 => None,
        0xFFFF => structure
            .dword(extended_offset)
            .map(|value| value & 0x7FFF_FFFF)
            .filter(|value| *value > 0),
        value => Some(u32::from(value)),
    }
}

/// Tamanho do módulo; `Some(None)` = instalado com tamanho desconhecido e
/// `None` = slot vazio.
fn module_size(structure: &Structure<'_>) -> Option<Option<u64>> {
    const MIB: u64 = 1024 * 1024;
    match structure.word(0x0C)? {
        0 => None,
        0xFFFF => Some(None),
        0x7FFF => Some(
            structure
                .dword(0x1C)
                .map(|mib| u64::from(mib & 0x7FFF_FFFF) * MIB),
        ),
        value if value & 0x8000 != 0 => Some(Some(u64::from(value & 0x7FFF) * 1024)),
        value => Some(Some(u64::from(value) * MIB)),
    }
}

fn memory_module(structure: &Structure<'_>) -> Option<MemoryModule> {
    let size_bytes = module_size(structure)?;
    Some(MemoryModule {
        locator: structure.string(0x10),
        manufacturer: structure.string(0x17),
        part_number: structure.string(0x1A),
        kind: structure.byte(0x12).and_then(MemoryKind::from_code),
        size_bytes,
        max_speed_mts: speed(structure, 0x15, 0x54),
        configured_speed_mts: speed(structure, 0x20, 0x58),
    })
}

/// Lê o buffer completo do `RawSMBIOSData`. `None` se o cabeçalho for inválido.
pub fn parse(raw: &[u8]) -> Option<SmbiosInfo> {
    let header = raw.get(..RAW_HEADER_LEN)?;
    let length = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
    let tables = raw.get(RAW_HEADER_LEN..RAW_HEADER_LEN.checked_add(length)?)?;

    let mut info = SmbiosInfo::default();
    for structure in structures(tables) {
        match structure.kind {
            TYPE_BIOS if info.bios.is_none() => info.bios = Some(bios(&structure)),
            TYPE_BASEBOARD if info.board.is_none() => info.board = Some(board(&structure)),
            TYPE_MEMORY_DEVICE => info.memory.extend(memory_module(&structure)),
            _ => {}
        }
    }
    Some(info)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Monta uma estrutura SMBIOS: parte formatada (sem o cabeçalho) + textos.
    pub(crate) fn structure(kind: u8, body: &[u8], strings: &[&str]) -> Vec<u8> {
        let mut bytes = vec![kind, (body.len() + 4) as u8, 0x00, 0x10];
        bytes.extend_from_slice(body);
        if strings.is_empty() {
            bytes.extend_from_slice(&[0, 0]);
        } else {
            for text in strings {
                bytes.extend_from_slice(text.as_bytes());
                bytes.push(0);
            }
            bytes.push(0);
        }
        bytes
    }

    /// Buffer `RawSMBIOSData` (cabeçalho do Windows + tabelas).
    pub(crate) fn raw(structures: &[Vec<u8>]) -> Vec<u8> {
        let tables: Vec<u8> = structures.concat();
        let mut bytes = vec![0, 3, 4, 0];
        bytes.extend_from_slice(&(tables.len() as u32).to_le_bytes());
        bytes.extend(tables);
        bytes
    }

    pub(crate) fn bios_structure(vendor: &str, version: &str, date: &str) -> Vec<u8> {
        // 0x04 fabricante, 0x05 versão, 0x08 data (texto 3).
        let mut body = vec![0u8; 0x12 - 4];
        body[0] = 1;
        body[1] = 2;
        body[4] = 3;
        structure(TYPE_BIOS, &body, &[vendor, version, date])
    }

    /// Módulo de memória (SMBIOS 3.x). O serial existe no buffer (texto 4),
    /// como numa placa real, para provar que nunca é lido.
    pub(crate) fn memory_structure(
        locator: &str,
        part_number: &str,
        size_mib: u16,
        max_mts: u16,
        configured_mts: u16,
    ) -> Vec<u8> {
        let mut body = vec![0u8; 0x5C - 4];
        let at = |offset: usize| offset - 4;
        body[at(0x0C)..at(0x0C) + 2].copy_from_slice(&size_mib.to_le_bytes());
        body[at(0x10)] = 1; // slot
        body[at(0x12)] = 0x1A; // DDR4
        body[at(0x15)..at(0x15) + 2].copy_from_slice(&max_mts.to_le_bytes());
        body[at(0x17)] = 2; // fabricante
        body[at(0x20)..at(0x20) + 2].copy_from_slice(&configured_mts.to_le_bytes());
        // O SMBIOS não tem texto vazio (encerraria a área de textos): campo sem
        // texto usa o índice 0.
        let mut strings = vec![locator, "Fabricante Exemplo"];
        if !part_number.is_empty() {
            strings.push(part_number);
            body[at(0x1A)] = strings.len() as u8;
        }
        strings.push("SERIAL-FICTICIO-123");
        body[at(0x18)] = strings.len() as u8; // serial (não lido)
        structure(TYPE_MEMORY_DEVICE, &body, &strings)
    }

    fn end() -> Vec<u8> {
        structure(TYPE_END_OF_TABLE, &[], &[])
    }

    #[test]
    fn reads_bios_board_and_installed_modules() {
        let board = structure(TYPE_BASEBOARD, &[1, 2, 0, 0], &["Placa Ltda", "Modelo X1"]);
        let empty_slot = memory_structure("DIMM_A1", "", 0, 0, 0);
        let data = raw(&[
            bios_structure("BIOS Exemplo", "1820", "05/15/2025"),
            board,
            empty_slot,
            memory_structure("DIMM_A2", "PECA-3200 ", 16_384, 3200, 2133),
            end(),
        ]);

        let info = parse(&data).unwrap();
        assert_eq!(
            info.bios,
            Some(BiosInfo {
                vendor: Some("BIOS Exemplo".into()),
                version: Some("1820".into()),
                release_date: Some("2025-05-15".into()),
            })
        );
        assert_eq!(
            info.board,
            Some(BoardInfo {
                manufacturer: Some("Placa Ltda".into()),
                product: Some("Modelo X1".into()),
            })
        );
        assert_eq!(info.memory.len(), 1, "o slot vazio fica de fora");
        let module = &info.memory[0];
        assert_eq!(module.locator.as_deref(), Some("DIMM_A2"));
        assert_eq!(module.part_number.as_deref(), Some("PECA-3200"));
        assert_eq!(module.kind, Some(MemoryKind::Ddr4));
        assert_eq!(module.size_bytes, Some(16 * 1024 * 1024 * 1024));
        assert_eq!(module.max_speed_mts, Some(3200));
        assert_eq!(module.configured_speed_mts, Some(2133));
    }

    #[test]
    fn never_exposes_the_serial_number() {
        let data = raw(&[memory_structure("DIMM_A1", "PECA", 8192, 3200, 3200), end()]);
        let info = parse(&data).unwrap();
        let json = serde_json::to_string(&info.memory).unwrap();
        assert!(!json.contains("SERIAL"));
    }

    #[test]
    fn unknown_speeds_and_placeholders_become_none() {
        let data = raw(&[
            memory_structure("DIMM_B1", "Not Specified", 8192, 0, 0),
            end(),
        ]);
        let module = &parse(&data).unwrap().memory[0];
        assert_eq!(module.part_number, None);
        assert_eq!(module.max_speed_mts, None);
        assert_eq!(module.configured_speed_mts, None);
    }

    #[test]
    fn old_tables_without_configured_speed() {
        // SMBIOS 2.6: a estrutura termina antes do campo 0x20.
        let full = memory_structure("DIMM0", "PECA", 4096, 1333, 1333);
        let mut short = full[..0x1C].to_vec();
        short[1] = 0x1C;
        short.extend_from_slice(&[b'D', b'I', b'M', b'M', b'0', 0, 0]);
        let module = &parse(&raw(&[short, end()])).unwrap().memory[0];
        assert_eq!(module.max_speed_mts, Some(1333));
        assert_eq!(module.configured_speed_mts, None);
        assert_eq!(module.locator.as_deref(), Some("DIMM0"));
    }

    #[test]
    fn extended_size_and_speed() {
        let mut data = memory_structure("DIMM_A1", "PECA", 0x7FFF, 0xFFFF, 0xFFFF);
        let at = |offset: usize| offset; // offsets contam desde o início da estrutura
        data[at(0x1C)..at(0x1C) + 4].copy_from_slice(&(64 * 1024u32).to_le_bytes());
        data[at(0x54)..at(0x54) + 4].copy_from_slice(&8000u32.to_le_bytes());
        data[at(0x58)..at(0x58) + 4].copy_from_slice(&6000u32.to_le_bytes());
        let module = &parse(&raw(&[data, end()])).unwrap().memory[0];
        assert_eq!(module.size_bytes, Some(64 * 1024 * 1024 * 1024));
        assert_eq!(module.max_speed_mts, Some(8000));
        assert_eq!(module.configured_speed_mts, Some(6000));
    }

    #[test]
    fn truncated_or_invalid_buffers() {
        assert_eq!(parse(&[]), None);
        assert_eq!(parse(&[0, 3, 4, 0, 200, 0, 0, 0, 1, 2]), None);
        // Estrutura com tamanho impossível: nada é lido, sem pânico.
        let broken = raw(&[vec![TYPE_BIOS, 2, 0, 0, 0, 0]]);
        assert_eq!(parse(&broken), Some(SmbiosInfo::default()));
        // Textos sem o par de zeros final.
        let mut cut = bios_structure("A", "B", "01/01/2020");
        cut.truncate(cut.len() - 2);
        assert_eq!(parse(&raw(&[cut])).unwrap().bios, None);
    }

    #[test]
    fn bios_dates() {
        assert_eq!(
            parse_bios_date("05/15/2025").map(|date| date.to_string()),
            Some("2025-05-15".into())
        );
        assert_eq!(
            parse_bios_date("12/31/99").map(|date| date.to_string()),
            Some("1999-12-31".into())
        );
        assert_eq!(
            parse_bios_date("01/02/21").map(|date| date.to_string()),
            Some("2021-01-02".into())
        );
        assert_eq!(parse_bios_date("2025-05-15"), None);
        assert_eq!(parse_bios_date("13/01/2025"), None);
        assert_eq!(parse_bios_date("05/15/2025/1"), None);
    }
}
