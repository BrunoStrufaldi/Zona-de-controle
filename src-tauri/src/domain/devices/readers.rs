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
    /// Último nível informado com o dispositivo ligado. Desligado, o aviso vem
    /// com nível 0, então é daqui que sai o "último nível" exibido.
    pub last_percent: Option<u8>,
}

impl ModelReading {
    /// Leitura nova a partir da anterior (se houver): ao desligar, mantém o
    /// último nível informado com o dispositivo ligado.
    pub fn next(previous: Option<&Self>, status: ReportedStatus, read_at_unix: i64) -> Self {
        let last_percent = match status.power {
            ReportedPower::Off => previous.and_then(|reading| reading.last_percent),
            ReportedPower::OnBattery | ReportedPower::Charging => Some(status.percent),
        };
        Self {
            status,
            read_at_unix,
            last_percent,
        }
    }
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
    fn turning_off_keeps_the_last_level_reported_while_on() {
        let status = |percent, power| ReportedStatus { percent, power };
        let first = ModelReading::next(None, status(100, ReportedPower::OnBattery), 10);
        assert_eq!(first.last_percent, Some(100));

        let off = ModelReading::next(Some(&first), status(0, ReportedPower::Off), 20);
        assert_eq!(off.status.power, ReportedPower::Off);
        assert_eq!(off.read_at_unix, 20);
        assert_eq!(off.last_percent, Some(100));

        // Desligado de novo (aviso repetido): continua com o mesmo nível.
        let again = ModelReading::next(Some(&off), status(0, ReportedPower::Off), 30);
        assert_eq!(again.last_percent, Some(100));

        // Religou: passa a valer o nível novo.
        let on = ModelReading::next(Some(&again), status(64, ReportedPower::Charging), 40);
        assert_eq!(on.last_percent, Some(64));

        // Primeiro aviso já é "desligado": não há nível a mostrar.
        let off_first = ModelReading::next(None, status(0, ReportedPower::Off), 50);
        assert_eq!(off_first.last_percent, None);
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
