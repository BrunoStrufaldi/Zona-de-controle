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
//!
//! Rapoo VT7 Max (receptor `24ae:1416`), coleção de fabricante `0xFF00` uso
//! `0x02`, relatório de entrada `0x07` (19 bytes), repetido a cada ~3 s com o
//! mouse ligado. Mapeado escutando o receptor real:
//! - byte 7: `01` na bateria, `02` carregando, `00` por ~3 s ao ligar ou trocar
//!   de modo (ignorado);
//! - byte 8: nível em % (visto só `64` = 100 até agora, com o mouse cheio);
//! - mouse desligado: o receptor para de enviar (sem relatório por > 10 s);
//! - o último byte oscila sozinho (não é nível nem estado).

/// Estado informado pelo dispositivo.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReportedPower {
    OnBattery,
    Charging,
    Off,
}

impl ReportedPower {
    /// Valor gravado em `device_battery_readings.power`.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OnBattery => "onBattery",
            Self::Charging => "charging",
            Self::Off => "off",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        [Self::OnBattery, Self::Charging, Self::Off]
            .into_iter()
            .find(|power| power.as_str() == value)
    }
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
    /// Veio do banco (sessão anterior do app ou receptor reconectado) e o
    /// dispositivo ainda não mandou aviso novo: é um registro antigo.
    pub from_saved: bool,
}

/// Uma leitura que não mudou é regravada no máximo a cada 5 min (só para
/// atualizar o horário); mudanças de nível ou estado são gravadas na hora.
pub const PERSIST_REFRESH_SECS: i64 = 300;

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
            from_saved: false,
        }
    }

    /// A mesma leitura, agora como registro antigo (receptor removido).
    pub fn as_saved(self) -> Self {
        Self {
            from_saved: true,
            ..self
        }
    }

    /// Esta leitura precisa ser gravada, dado o que foi gravado por último?
    pub fn should_persist(&self, last_saved: Option<&Self>) -> bool {
        if self.from_saved {
            return false;
        }
        match last_saved {
            None => true,
            Some(saved) => {
                saved.status != self.status
                    || saved.last_percent != self.last_percent
                    || self.read_at_unix - saved.read_at_unix >= PERSIST_REFRESH_SECS
            }
        }
    }
}

/// Como escutar um modelo: qual coleção HID e como interpretar o relatório.
#[derive(Debug, Clone, Copy)]
pub struct ReportReader {
    pub usage_page: u16,
    /// Uso da coleção, quando várias coleções têm a mesma página.
    pub usage: Option<u16>,
    /// `None` para relatórios que não são de status (ex.: "conectou").
    pub parse: fn(&[u8]) -> Option<ReportedStatus>,
    /// Para modelos que repetem o status em intervalo fixo: sem relatório por
    /// esse tempo (em segundos), o dispositivo é considerado desligado.
    pub off_after_silence_secs: Option<u64>,
}

impl ReportReader {
    /// A coleção HID (`usage_page`, `usage`) é a que este leitor escuta?
    pub fn matches(&self, usage_page: u16, usage: u16) -> bool {
        self.usage_page == usage_page
            && match self.usage {
                Some(expected) => expected == usage,
                None => true,
            }
    }

    /// Sem relatório há `silent_secs` segundos, o dispositivo está desligado?
    /// Só vale para modelos que repetem o status em intervalo fixo.
    pub fn is_off_after(&self, silent_secs: u64) -> bool {
        self.off_after_silence_secs
            .is_some_and(|limit| silent_secs > limit)
    }
}

/// Status de "desligado" (nível 0): o último nível vem de `ModelReading`.
pub const OFF_STATUS: ReportedStatus = ReportedStatus {
    percent: 0,
    power: ReportedPower::Off,
};

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
    usage: None,
    parse: parse_mchose_v9,
    // Desligado, o headset avisa (`55 65 00 1a`); na bateria ele não repete o
    // status, então silêncio não quer dizer nada.
    off_after_silence_secs: None,
};

const RAPOO_REPORT_ID: u8 = 0x07;
const RAPOO_ON_BATTERY: u8 = 0x01;
const RAPOO_CHARGING: u8 = 0x02;

/// Relatório `0x07` do Rapoo VT7 Max (com o id do relatório no primeiro byte).
pub fn parse_rapoo_vt7(report: &[u8]) -> Option<ReportedStatus> {
    let [RAPOO_REPORT_ID, _, _, _, _, _, _, state, percent, ..] = *report else {
        return None;
    };
    let power = match state {
        RAPOO_ON_BATTERY => ReportedPower::OnBattery,
        RAPOO_CHARGING => ReportedPower::Charging,
        // `00` (transição ao ligar/trocar de modo) ou estado não mapeado.
        _ => return None,
    };
    if percent > 100 {
        return None;
    }
    Some(ReportedStatus { percent, power })
}

pub const RAPOO_VT7_READER: ReportReader = ReportReader {
    usage_page: 0xFF00,
    usage: Some(0x02),
    parse: parse_rapoo_vt7,
    // Ligado, repete a cada ~3 s; desligado, o receptor fica em silêncio.
    off_after_silence_secs: Some(10),
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

    /// Relatório `0x07` do Rapoo como capturado (19 bytes).
    fn rapoo(state: u8, percent: u8, last: u8) -> [u8; 19] {
        [
            0x07, 0x20, 0x02, 0x84, 0x03, 0x84, 0x03, state, percent, 0x00, 0x03, 0x01, 0x00, 0x16,
            0x46, 0x00, 0x02, 0x02, last,
        ]
    }

    #[test]
    fn parses_the_rapoo_reports_captured_from_the_real_receiver() {
        assert_eq!(
            parse_rapoo_vt7(&rapoo(0x01, 0x64, 0xb5)),
            Some(ReportedStatus {
                percent: 100,
                power: ReportedPower::OnBattery
            })
        );
        assert_eq!(
            parse_rapoo_vt7(&rapoo(0x02, 0x64, 0xa6)),
            Some(ReportedStatus {
                percent: 100,
                power: ReportedPower::Charging
            })
        );
        // O último byte oscila sozinho: não muda a leitura.
        assert_eq!(
            parse_rapoo_vt7(&rapoo(0x01, 0x40, 0x00)),
            parse_rapoo_vt7(&rapoo(0x01, 0x40, 0xff))
        );
        // Transição (`00`) e estado desconhecido: sem leitura.
        assert_eq!(parse_rapoo_vt7(&rapoo(0x00, 0x64, 0xb8)), None);
        assert_eq!(parse_rapoo_vt7(&rapoo(0x05, 0x64, 0xb8)), None);
        // Nível impossível, curto demais ou outro relatório.
        assert_eq!(parse_rapoo_vt7(&rapoo(0x01, 0xC8, 0xb8)), None);
        assert_eq!(parse_rapoo_vt7(&rapoo(0x01, 0x64, 0xb8)[..8]), None);
        let mut other = rapoo(0x01, 0x64, 0xb8);
        other[0] = 0x08;
        assert_eq!(parse_rapoo_vt7(&other), None);
    }

    #[test]
    fn readers_pick_their_collection() {
        // Rapoo: várias coleções 0xFF00; só a de uso 0x02 traz o status.
        assert!(RAPOO_VT7_READER.matches(0xFF00, 0x02));
        assert!(!RAPOO_VT7_READER.matches(0xFF00, 0x0E));
        // MCHOSE: qualquer uso da página 0xFF90.
        assert!(MCHOSE_V9_READER.matches(0xFF90, 0x01));
        assert!(!MCHOSE_V9_READER.matches(0xFF00, 0x01));
    }

    #[test]
    fn silence_means_off_only_for_models_that_repeat_the_status() {
        assert!(!RAPOO_VT7_READER.is_off_after(10));
        assert!(RAPOO_VT7_READER.is_off_after(11));
        // O headset não repete o status na bateria: silêncio não diz nada.
        assert!(!MCHOSE_V9_READER.is_off_after(3_600));
    }

    #[test]
    fn saves_changes_right_away_and_repeats_only_every_few_minutes() {
        let on = |percent| ReportedStatus {
            percent,
            power: ReportedPower::OnBattery,
        };
        let saved = ModelReading::next(None, on(80), 1_000);
        assert!(saved.should_persist(None));

        // Mesmo status 3 s depois (o mouse repete): não regrava.
        let same = ModelReading::next(Some(&saved), on(80), 1_003);
        assert!(!same.should_persist(Some(&saved)));
        // Mesmo status depois de 5 min: regrava para atualizar o horário.
        let later = ModelReading::next(Some(&saved), on(80), 1_000 + PERSIST_REFRESH_SECS);
        assert!(later.should_persist(Some(&saved)));
        // Nível ou estado mudou: grava na hora.
        let lower = ModelReading::next(Some(&saved), on(79), 1_010);
        assert!(lower.should_persist(Some(&saved)));
        let off = ModelReading::next(Some(&saved), OFF_STATUS, 1_010);
        assert!(off.should_persist(Some(&saved)));

        // Registro vindo do banco nunca é regravado.
        assert!(!saved.as_saved().should_persist(None));
        assert!(saved.as_saved().from_saved);
        // Aviso novo sobre um registro antigo volta a ser leitura atual.
        let fresh = ModelReading::next(Some(&saved.as_saved()), on(80), 2_000);
        assert!(!fresh.from_saved);
    }

    #[test]
    fn stores_the_power_state_as_text() {
        for power in [
            ReportedPower::OnBattery,
            ReportedPower::Charging,
            ReportedPower::Off,
        ] {
            assert_eq!(ReportedPower::parse(power.as_str()), Some(power));
        }
        assert_eq!(ReportedPower::parse("full"), None);
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
