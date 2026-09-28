//! Datas e horários locais (`aaaa-mm-dd`, `HH:MM`, sem fuso), com aritmética
//! de dias, meses e anos. Evita dependências externas: a conversão para dias
//! corridos usa o algoritmo `days_from_civil` (Howard Hinnant).

use std::fmt;

/// Dia da semana no padrão do frontend: 0 = domingo … 6 = sábado.
pub type Weekday = u8;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct CalendarDate {
    year: i32,
    month: u32,
    day: u32,
}

impl CalendarDate {
    /// Converte `aaaa-mm-dd`, exigindo dia existente no mês (considera anos bissextos).
    pub fn parse(value: &str) -> Option<Self> {
        let bytes = value.as_bytes();
        if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
            return None;
        }
        let part = |range: std::ops::Range<usize>| -> Option<u32> {
            let text = &value[range];
            text.bytes()
                .all(|b| b.is_ascii_digit())
                .then(|| text.parse().ok())
                .flatten()
        };
        let (year, month, day) = (part(0..4)?, part(5..7)?, part(8..10)?);
        let year = i32::try_from(year).ok()?;
        let valid = year >= 1
            && (1..=12).contains(&month)
            && (1..=days_in_month(year, month)).contains(&day);
        valid.then_some(Self { year, month, day })
    }

    pub fn year(self) -> i32 {
        self.year
    }

    pub fn day(self) -> u32 {
        self.day
    }

    pub fn weekday(self) -> Weekday {
        // 1970-01-01 foi uma quinta-feira (4).
        (self.to_days() + 4).rem_euclid(7) as Weekday
    }

    pub fn add_days(self, days: i64) -> Self {
        Self::from_days(self.to_days() + days)
    }

    /// Dias de `self` até `later` (negativo se `later` for anterior).
    pub fn days_until(self, later: Self) -> i64 {
        later.to_days() - self.to_days()
    }

    /// Soma meses mantendo o dia `anchor_day`, limitado ao último dia do mês
    /// (ex.: 31/01 + 1 mês = 28/02 ou 29/02).
    pub fn add_months(self, months: i64, anchor_day: u32) -> Self {
        let index = i64::from(self.year) * 12 + i64::from(self.month) - 1 + months;
        let year = index.div_euclid(12) as i32;
        let month = index.rem_euclid(12) as u32 + 1;
        Self {
            year,
            month,
            day: anchor_day.min(days_in_month(year, month)),
        }
    }

    /// Dias corridos desde 1970-01-01.
    fn to_days(self) -> i64 {
        let year = i64::from(self.year) - i64::from(self.month <= 2);
        let era = year.div_euclid(400);
        let year_of_era = year - era * 400;
        let month = i64::from(self.month);
        let day_of_year =
            (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + i64::from(self.day) - 1;
        let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
        era * 146_097 + day_of_era - 719_468
    }

    fn from_days(days: i64) -> Self {
        let days = days + 719_468;
        let era = days.div_euclid(146_097);
        let day_of_era = days - era * 146_097;
        let year_of_era =
            (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
        let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
        let month_index = (5 * day_of_year + 2) / 153;
        let day = (day_of_year - (153 * month_index + 2) / 5 + 1) as u32;
        let month = if month_index < 10 {
            month_index + 3
        } else {
            month_index - 9
        } as u32;
        let year = (year_of_era + era * 400 + i64::from(month <= 2)) as i32;
        Self { year, month, day }
    }
}

impl fmt::Display for CalendarDate {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }
}

const MINUTES_PER_DAY: i64 = 24 * 60;

/// Horário local `HH:MM` (minutos desde a meia-noite).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct TimeOfDay(u16);

impl TimeOfDay {
    pub fn parse(value: &str) -> Option<Self> {
        let bytes = value.as_bytes();
        if bytes.len() != 5 || bytes[2] != b':' {
            return None;
        }
        let part = |text: &str| -> Option<u16> {
            text.bytes()
                .all(|b| b.is_ascii_digit())
                .then(|| text.parse().ok())
                .flatten()
        };
        let (hour, minute) = (part(&value[0..2])?, part(&value[3..5])?);
        (hour < 24 && minute < 60).then_some(Self(hour * 60 + minute))
    }
}

impl fmt::Display for TimeOfDay {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:02}:{:02}", self.0 / 60, self.0 % 60)
    }
}

/// Instante local (data + horário), comparável e com soma de minutos.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct LocalDateTime {
    pub date: CalendarDate,
    pub time: TimeOfDay,
}

impl LocalDateTime {
    /// Converte `aaaa-mm-ddTHH:MM` (ou com espaço no lugar do `T`).
    pub fn parse(value: &str) -> Option<Self> {
        if value.len() != 16 || !matches!(value.as_bytes()[10], b'T' | b' ') {
            return None;
        }
        Some(Self {
            date: CalendarDate::parse(&value[..10])?,
            time: TimeOfDay::parse(&value[11..])?,
        })
    }

    pub fn add_minutes(self, minutes: i64) -> Self {
        let total = self.date.to_days() * MINUTES_PER_DAY + i64::from(self.time.0) + minutes;
        Self {
            date: CalendarDate::from_days(total.div_euclid(MINUTES_PER_DAY)),
            time: TimeOfDay(total.rem_euclid(MINUTES_PER_DAY) as u16),
        }
    }
}

impl fmt::Display for LocalDateTime {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}T{}", self.date, self.time)
    }
}

fn days_in_month(year: i32, month: u32) -> u32 {
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(value: &str) -> CalendarDate {
        CalendarDate::parse(value).unwrap()
    }

    #[test]
    fn parses_and_formats() {
        assert_eq!(date("2026-09-25").to_string(), "2026-09-25");
        assert_eq!(date("0001-01-01").to_string(), "0001-01-01");
        for invalid in ["2026-02-29", "2026-00-10", "0000-01-01", "2026-9-25", "x"] {
            assert!(CalendarDate::parse(invalid).is_none(), "{invalid}");
        }
    }

    #[test]
    fn round_trips_through_day_numbers() {
        for value in [
            "1970-01-01",
            "2000-02-29",
            "2026-12-31",
            "0001-01-01",
            "9999-12-31",
        ] {
            let parsed = date(value);
            assert_eq!(CalendarDate::from_days(parsed.to_days()), parsed, "{value}");
        }
        assert_eq!(date("1970-01-01").to_days(), 0);
    }

    #[test]
    fn adds_days_across_months_and_years() {
        assert_eq!(date("2026-12-31").add_days(1).to_string(), "2027-01-01");
        assert_eq!(date("2024-02-28").add_days(1).to_string(), "2024-02-29");
        assert_eq!(date("2026-03-01").add_days(-1).to_string(), "2026-02-28");
    }

    #[test]
    fn adds_months_clamping_to_the_last_day() {
        assert_eq!(
            date("2026-01-31").add_months(1, 31).to_string(),
            "2026-02-28"
        );
        assert_eq!(
            date("2024-01-31").add_months(1, 31).to_string(),
            "2024-02-29"
        );
        assert_eq!(
            date("2026-02-28").add_months(1, 31).to_string(),
            "2026-03-31"
        );
        assert_eq!(
            date("2026-11-15").add_months(3, 15).to_string(),
            "2027-02-15"
        );
    }

    #[test]
    fn parses_times_and_date_times() {
        assert_eq!(TimeOfDay::parse("00:00"), Some(TimeOfDay(0)));
        assert_eq!(TimeOfDay::parse("23:59").unwrap().to_string(), "23:59");
        for invalid in ["24:00", "12:60", "9:30", "12-30", "ab:cd", ""] {
            assert!(TimeOfDay::parse(invalid).is_none(), "{invalid}");
        }
        let instant = LocalDateTime::parse("2026-09-25T14:30").unwrap();
        assert_eq!(instant.to_string(), "2026-09-25T14:30");
        assert_eq!(LocalDateTime::parse("2026-09-25 14:30"), Some(instant));
        assert!(LocalDateTime::parse("2026-09-25").is_none());
    }

    #[test]
    fn adds_minutes_across_days() {
        let instant = LocalDateTime::parse("2026-12-31T23:50").unwrap();
        assert_eq!(instant.add_minutes(15).to_string(), "2027-01-01T00:05");
        assert_eq!(
            instant.add_minutes(-24 * 60).to_string(),
            "2026-12-30T23:50"
        );
        assert!(instant.add_minutes(1) > instant);
    }

    #[test]
    fn computes_weekdays() {
        assert_eq!(date("2026-09-25").weekday(), 5); // sexta
        assert_eq!(date("2026-09-27").weekday(), 0); // domingo
        assert_eq!(date("1970-01-01").weekday(), 4); // quinta
    }
}
