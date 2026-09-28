//! Períodos dos lançamentos: mês de referência (`aaaa-mm`) e intervalo de datas.

use std::fmt;

use crate::domain::calendar::CalendarDate;
use crate::error::{AppError, AppResult};

/// Maior intervalo aceito numa listagem (um ano, bissexto inclusive).
pub const MAX_RANGE_DAYS: i64 = 366;

/// Mês de referência, exibido como `aaaa-mm`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct YearMonth {
    year: i32,
    month: u32,
}

impl YearMonth {
    /// Converte `aaaa-mm` (mês 01–12).
    pub fn parse(value: &str) -> AppResult<Self> {
        CalendarDate::parse(&format!("{value}-01"))
            .map(Self::of)
            .ok_or_else(|| AppError::Validation(format!("mês inválido: {value}")))
    }

    pub fn of(date: CalendarDate) -> Self {
        Self {
            year: date.year(),
            month: date.month(),
        }
    }

    pub fn first_day(self) -> CalendarDate {
        CalendarDate::parse(&format!("{self}-01")).expect("mês sempre válido")
    }

    pub fn last_day(self) -> CalendarDate {
        self.add_months(1).first_day().add_days(-1)
    }

    /// Soma meses (valores negativos voltam).
    pub fn add_months(self, months: i64) -> Self {
        Self::of(self.first_day().add_months(months, 1))
    }
}

impl fmt::Display for YearMonth {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:04}-{:02}", self.year, self.month)
    }
}

/// Intervalo de datas inclusivo, com no máximo [`MAX_RANGE_DAYS`] dias.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DateRange {
    pub from: CalendarDate,
    pub to: CalendarDate,
}

impl DateRange {
    pub fn parse(from: &str, to: &str) -> AppResult<Self> {
        let parse = |value: &str| {
            CalendarDate::parse(value)
                .ok_or_else(|| AppError::Validation(format!("data inválida: {value}")))
        };
        let (from, to) = (parse(from)?, parse(to)?);
        if to < from {
            return Err(AppError::Validation(
                "a data final é anterior à inicial".into(),
            ));
        }
        if from.days_until(to) >= MAX_RANGE_DAYS {
            return Err(AppError::Validation(format!(
                "o período pode ter no máximo {MAX_RANGE_DAYS} dias"
            )));
        }
        Ok(Self { from, to })
    }

    pub fn month(month: YearMonth) -> Self {
        Self {
            from: month.first_day(),
            to: month.last_day(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_walks_months() {
        let september = YearMonth::parse("2026-09").unwrap();
        assert_eq!(september.to_string(), "2026-09");
        assert_eq!(september.first_day().to_string(), "2026-09-01");
        assert_eq!(september.last_day().to_string(), "2026-09-30");
        assert_eq!(september.add_months(4).to_string(), "2027-01");
        assert_eq!(september.add_months(-9).to_string(), "2025-12");
        assert_eq!(
            YearMonth::parse("2024-02").unwrap().last_day().to_string(),
            "2024-02-29"
        );
        for invalid in ["2026-13", "2026-00", "2026-9", "setembro", "2026-09-01"] {
            assert!(YearMonth::parse(invalid).is_err(), "{invalid}");
        }
    }

    #[test]
    fn validates_ranges() {
        let year = DateRange::parse("2024-01-01", "2024-12-31").unwrap();
        assert_eq!(year.to.to_string(), "2024-12-31");
        assert!(DateRange::parse("2026-09-30", "2026-09-01").is_err());
        assert!(DateRange::parse("2026-01-01", "2027-01-02").is_err());
        assert!(DateRange::parse("2026-02-30", "2026-03-01").is_err());

        let month = DateRange::month(YearMonth::parse("2026-02").unwrap());
        assert_eq!(
            (month.from.to_string(), month.to.to_string()),
            ("2026-02-01".to_string(), "2026-02-28".to_string())
        );
    }
}
