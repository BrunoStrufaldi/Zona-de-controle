//! Ciclo da fatura de um cartão de crédito: em que fatura cai uma cobrança.

use serde::{Deserialize, Serialize};

use crate::domain::calendar::CalendarDate;
use crate::error::{AppError, AppResult};

/// Dia de fechamento e dia de vencimento da fatura (1–31; nos meses mais
/// curtos vale o último dia). Compras a partir do dia do fechamento vão para a
/// fatura seguinte.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardCycle {
    pub closing_day: u32,
    pub due_day: u32,
}

impl CardCycle {
    /// Os dois dias juntos ou nenhum.
    pub fn from_days(closing_day: Option<u32>, due_day: Option<u32>) -> AppResult<Option<Self>> {
        match (closing_day, due_day) {
            (None, None) => Ok(None),
            (Some(closing_day), Some(due_day)) => {
                let valid = |day: u32| (1..=31).contains(&day);
                if !valid(closing_day) || !valid(due_day) {
                    return Err(AppError::Validation(
                        "os dias de fechamento e de vencimento vão de 1 a 31".into(),
                    ));
                }
                Ok(Some(Self {
                    closing_day,
                    due_day,
                }))
            }
            _ => Err(AppError::Validation(
                "informe o dia de fechamento e o de vencimento da fatura, ou nenhum dos dois"
                    .into(),
            )),
        }
    }

    /// Vencimento da fatura em que cai uma cobrança feita em `charged`.
    pub fn due_date_for(self, charged: CalendarDate) -> CalendarDate {
        let closing_this_month = charged.add_months(0, self.closing_day);
        let closing = if charged < closing_this_month {
            closing_this_month
        } else {
            charged.add_months(1, self.closing_day)
        };
        // Vencimento depois do fechamento no mesmo mês; senão, no mês seguinte.
        let months = if self.due_day > self.closing_day {
            0
        } else {
            1
        };
        closing.add_months(months, self.due_day)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(value: &str) -> CalendarDate {
        CalendarDate::parse(value).unwrap()
    }

    fn due(cycle: CardCycle, charged: &str) -> String {
        cycle.due_date_for(date(charged)).to_string()
    }

    #[test]
    fn finds_the_statement_of_a_charge() {
        // Fecha dia 28, vence dia 5 do mês seguinte.
        let late_closing = CardCycle {
            closing_day: 28,
            due_day: 5,
        };
        assert_eq!(due(late_closing, "2026-09-10"), "2026-10-05");
        assert_eq!(due(late_closing, "2026-09-27"), "2026-10-05");
        // No dia do fechamento já vai para a próxima.
        assert_eq!(due(late_closing, "2026-09-28"), "2026-11-05");
        assert_eq!(due(late_closing, "2026-12-30"), "2027-02-05");

        // Fecha dia 3, vence dia 10 do mesmo mês.
        let early_closing = CardCycle {
            closing_day: 3,
            due_day: 10,
        };
        assert_eq!(due(early_closing, "2026-09-02"), "2026-09-10");
        assert_eq!(due(early_closing, "2026-09-03"), "2026-10-10");

        // Dia 31 vira o último dia dos meses curtos.
        let month_end = CardCycle {
            closing_day: 31,
            due_day: 10,
        };
        assert_eq!(due(month_end, "2026-02-27"), "2026-03-10");
        assert_eq!(due(month_end, "2026-02-28"), "2026-04-10");
    }

    #[test]
    fn needs_both_days() {
        assert_eq!(CardCycle::from_days(None, None).unwrap(), None);
        assert!(CardCycle::from_days(Some(28), None).is_err());
        assert!(CardCycle::from_days(Some(0), Some(5)).is_err());
        assert!(CardCycle::from_days(Some(28), Some(32)).is_err());
        assert_eq!(
            CardCycle::from_days(Some(28), Some(5)).unwrap(),
            Some(CardCycle {
                closing_day: 28,
                due_day: 5
            })
        );
    }
}
