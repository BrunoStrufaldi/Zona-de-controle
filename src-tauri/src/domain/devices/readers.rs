//! Leitores de bateria por modelo (3.3b): interpretam os relatórios que o
//! receptor envia **sozinho**. O app só escuta; nenhum comando é enviado.
//!
//! MCHOSE V9 PRO (receptor C-Media `291d:385d`), coleção de fabricante `0xFF90`,
//! relatório de entrada `0x55` (63 bytes). Mapeado escutando o receptor real:
//! - `55 65 <nível> 02`: ligado, na bateria (`nível` em %, 0–100);
//! - `55 65 <nível> 03`: carregando (repetido a cada ~10 s enquanto carrega);
//! - `55 65 00 1a`: headset desligado;
//! - `55 11 01`: headset conectou ao receptor (o status vem logo depois).
//!
//! Na bateria o headset não repete o status em intervalo fixo: ele avisa ao
//! ligar, ao mudar o carregamento e ocasionalmente. Antes do primeiro aviso a
//! bateria fica "aguardando leitura" — nunca estimada.

/// Estado informado pelo dispositivo.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReportedPower {
    OnBattery,
    Charging,
    Off,
}

/// Status lido de um relatório do receptor.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ReportedStatus {
    /// 0–100 (0 quando desligado).
    pub percent: u8,
    pub power: ReportedPower,
}

/// Última leitura guardada (em memória, enquanto o app está aberto).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModelReading {
    pub status: ReportedStatus,
    /// Instante da leitura em segundos desde a época Unix.
    pub read_at_unix: i64,
}

/// Como escutar um modelo: qual coleção HID e como interpretar o relatório.
#[derive(Debug, Clone, Copy)]
pub struct ReportReader {
    pub usage_page: u16,
    /// `None` para relatórios que não são de status (ex.: "conectou").
    pub parse: fn(&[u8]) -> Option<ReportedStatus>,
}

const MCHOSE_REPORT_ID: u8 = 0x55;
const MCHOSE_STATUS: u8 = 0x65;
const MCHOSE_ON_BATTERY: u8 = 0x02;
const MCHOSE_CHARGING: u8 = 0x03;

/// Relatório `0x55` do MCHOSE V9 PRO (com o id do relatório no primeiro byte).
pub fn parse_mchose_v9(report: &[u8]) -> Option<ReportedStatus> {
    let [MCHOSE_REPORT_ID, MCHOSE_STATUS, percent, state, ..] = *report else {
        return None;
    };
    let power = match state {
        MCHOSE_ON_BATTERY => ReportedPower::OnBattery,
        MCHOSE_CHARGING => ReportedPower::Charging,
        // Desligado: nível 0 com outro estado (visto `1a`).
        _ if percent == 0 => ReportedPower::Off,
        // Estado ainda não mapeado: melhor não mostrar do que chutar.
        _ => return None,
    };
    if percent > 100 {
        return None;
    }
    Some(ReportedStatus { percent, power })
}

pub const MCHOSE_V9_READER: ReportReader = ReportReader {
    usage_page: 0xFF90,
    parse: parse_mchose_v9,
};

#[cfg(test)]
mod tests {
    use super::*;

    /// Relatório de 64 bytes como o receptor envia (o resto é zero).
    fn report(bytes: &[u8]) -> Vec<u8> {
        let mut data = bytes.to_vec();
        data.resize(64, 0);
        data
    }

    #[test]
    fn parses_the_reports_captured_from_the_real_receiver() {
        assert_eq!(
            parse_mchose_v9(&report(&[0x55, 0x65, 0x64, 0x02])),
            Some(ReportedStatus {
                percent: 100,
                power: ReportedPower::OnBattery
            })
        );
        assert_eq!(
            parse_mchose_v9(&report(&[0x55, 0x65, 0x64, 0x03])),
            Some(ReportedStatus {
                percent: 100,
                power: ReportedPower::Charging
            })
        );
        assert_eq!(
            parse_mchose_v9(&report(&[0x55, 0x65, 0x00, 0x1a])),
            Some(ReportedStatus {
                percent: 0,
                power: ReportedPower::Off
            })
        );
    }

    #[test]
    fn ignores_other_reports_and_unknown_states() {
        // "Conectou": não é status.
        assert_eq!(parse_mchose_v9(&report(&[0x55, 0x11, 0x01])), None);
        // Estado desconhecido com nível: não chuta.
        assert_eq!(parse_mchose_v9(&report(&[0x55, 0x65, 0x40, 0x07])), None);
        // Nível impossível.
        assert_eq!(parse_mchose_v9(&report(&[0x55, 0x65, 0xC8, 0x02])), None);
        // Curto demais ou outro relatório.
        assert_eq!(parse_mchose_v9(&[0x55, 0x65, 0x64]), None);
        assert_eq!(parse_mchose_v9(&report(&[0x41, 0x65, 0x64, 0x02])), None);
    }
}
