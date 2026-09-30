//! Vínculo de linhas importadas com vencimentos de recorrentes (Fase 5.3).
//!
//! Só entradas e saídas (transferências recorrentes são registradas na tela).
//! Uma linha é compatível com um vencimento em aberto do mesmo tipo quando a
//! data fica perto do vencimento (`Schedule::match_window_days`). A sugestão
//! automática exige também valor parecido (até 2% ou R$ 1,00 de diferença) ou
//! a mesma chave de descrição aprendida num vínculo anterior (contas de valor
//! variável, como energia). Cada linha e cada vencimento entram em no máximo
//! um vínculo: os melhores pares são escolhidos primeiro.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::domain::calendar::CalendarDate;
use crate::domain::finance::recurring::Series;
use crate::domain::finance::TransactionKind;

/// Opções de vínculo mostradas por linha.
pub const MAX_CANDIDATES: usize = 5;
/// Diferença de valor aceita na sugestão automática sem chave aprendida.
const AMOUNT_TOLERANCE_CENTS: i64 = 100;
const AMOUNT_TOLERANCE_DIVISOR: i64 = 50;

/// Vencimento de uma série (identificado pela data original).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OccurrenceRef {
    pub recurring_id: i64,
    pub occurrence_date: String,
}

/// Opção de vínculo de uma linha, como a tela mostra.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurringCandidate {
    pub recurring_id: i64,
    pub occurrence_date: String,
    pub description: String,
    /// Valor previsto (centavos).
    pub amount: i64,
    pub category_id: Option<i64>,
}

/// Vencimento em aberto de uma série de entrada ou saída.
#[derive(Debug, Clone, PartialEq)]
pub struct OpenOccurrence {
    pub recurring_id: i64,
    pub date: CalendarDate,
    pub kind: TransactionKind,
    pub amount: i64,
    pub description: String,
    pub category_id: Option<i64>,
    pub import_key: Option<String>,
    pub window_days: i64,
}

/// Vencimentos em aberto que podem casar com linhas de `from` a `to`.
pub fn open_occurrences(
    series: &[Series],
    from: CalendarDate,
    to: CalendarDate,
) -> Vec<OpenOccurrence> {
    series
        .iter()
        .filter(|item| item.kind != TransactionKind::Transfer)
        .flat_map(|item| {
            let window = item.schedule.match_window_days();
            let (first, last) = (from.add_days(-window), to.add_days(window));
            item.schedule
                .dates()
                .take_while(move |date| *date <= last)
                .filter(move |date| *date >= first && !item.resolved.contains_key(date))
                .map(move |date| OpenOccurrence {
                    recurring_id: item.id,
                    date,
                    kind: item.kind,
                    amount: item.amount,
                    description: item.description.clone(),
                    category_id: item.category_id,
                    import_key: item.import_key.clone(),
                    window_days: window,
                })
        })
        .collect()
}

/// O que importa de uma linha para o vínculo.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LineFacts<'a> {
    pub date: CalendarDate,
    /// Centavos com sinal (positivo entra).
    pub amount: i64,
    /// Chave da descrição (`suggest::description_key`).
    pub key: Option<&'a str>,
}

/// Opções de uma linha e, se houver, a sugerida (índice em `candidates`).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct LineMatches {
    pub candidates: Vec<RecurringCandidate>,
    pub suggested: Option<usize>,
}

impl LineMatches {
    pub fn suggestion(&self) -> Option<&RecurringCandidate> {
        self.suggested.and_then(|index| self.candidates.get(index))
    }
}

/// Classificação de um par (menor = melhor) e se vale como sugestão automática.
fn rank(
    line: &LineFacts<'_>,
    occurrence: &OpenOccurrence,
) -> Option<((bool, bool, i64, i64), bool)> {
    let kind = if line.amount > 0 {
        TransactionKind::Income
    } else {
        TransactionKind::Expense
    };
    let days = line.date.days_until(occurrence.date).abs();
    if kind != occurrence.kind || days > occurrence.window_days {
        return None;
    }
    let key_match = line.key.is_some() && line.key == occurrence.import_key.as_deref();
    let difference = (line.amount.abs() - occurrence.amount).abs();
    let close = difference <= AMOUNT_TOLERANCE_CENTS
        || difference * AMOUNT_TOLERANCE_DIVISOR <= occurrence.amount;
    Some(((!key_match, !close, difference, days), key_match || close))
}

fn candidate(occurrence: &OpenOccurrence) -> RecurringCandidate {
    RecurringCandidate {
        recurring_id: occurrence.recurring_id,
        occurrence_date: occurrence.date.to_string(),
        description: occurrence.description.clone(),
        amount: occurrence.amount,
        category_id: occurrence.category_id,
    }
}

/// Opções e sugestão de cada linha (`None` = linha fora do vínculo, como
/// duplicados e o pagamento da fatura).
pub fn match_lines(lines: &[Option<LineFacts<'_>>], open: &[OpenOccurrence]) -> Vec<LineMatches> {
    let mut strong = Vec::new();
    let mut ranked: Vec<Vec<(_, usize)>> = lines
        .iter()
        .enumerate()
        .map(|(line_index, line)| {
            let Some(line) = line else {
                return Vec::new();
            };
            let mut options: Vec<_> = open
                .iter()
                .enumerate()
                .filter_map(|(index, occurrence)| {
                    let (score, automatic) = rank(line, occurrence)?;
                    if automatic {
                        strong.push((score, line_index, index));
                    }
                    Some((score, index))
                })
                .collect();
            options.sort_unstable();
            options
        })
        .collect();

    // Melhores pares primeiro; cada linha e cada vencimento uma vez só.
    strong.sort_unstable();
    let mut chosen: Vec<Option<usize>> = vec![None; lines.len()];
    let mut used = HashSet::new();
    for (_, line_index, index) in strong {
        if chosen[line_index].is_none() && used.insert(index) {
            chosen[line_index] = Some(index);
        }
    }

    ranked
        .iter_mut()
        .zip(chosen)
        .map(|(options, chosen)| {
            let mut indexes: Vec<usize> = options
                .iter()
                .map(|(_, index)| *index)
                .take(MAX_CANDIDATES)
                .collect();
            if let Some(index) = chosen {
                if !indexes.contains(&index) {
                    indexes.pop();
                    indexes.push(index);
                }
            }
            LineMatches {
                suggested: chosen.and_then(|index| indexes.iter().position(|i| *i == index)),
                candidates: indexes
                    .into_iter()
                    .map(|index| candidate(&open[index]))
                    .collect(),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;
    use crate::domain::finance::recurring::{RecurringRule, Resolution, Schedule};
    use crate::domain::task_recurrence::RecurrenceFrequency;

    fn date(value: &str) -> CalendarDate {
        CalendarDate::parse(value).unwrap()
    }

    fn series(id: i64, kind: TransactionKind, amount: i64, start: &str) -> Series {
        Series {
            id,
            kind,
            description: format!("Série {id}"),
            amount,
            account_id: 1,
            transfer_account_id: (kind == TransactionKind::Transfer).then_some(2),
            category_id: Some(id * 10),
            schedule: Schedule::new(
                date(start),
                RecurringRule {
                    frequency: RecurrenceFrequency::Monthly,
                    interval: 1,
                    until: None,
                    count: None,
                },
            )
            .unwrap(),
            notes: String::new(),
            import_key: None,
            on_card: false,
            card_cycle: None,
            created_at: String::new(),
            updated_at: String::new(),
            resolved: BTreeMap::new(),
        }
    }

    fn line(date_value: &str, amount: i64) -> Option<LineFacts<'static>> {
        Some(LineFacts {
            date: date(date_value),
            amount,
            key: None,
        })
    }

    #[test]
    fn lists_open_occurrences_near_the_statement() {
        let mut rent = series(1, TransactionKind::Expense, 200_000, "2026-08-05");
        rent.resolved
            .insert(date("2026-08-05"), Resolution::Skipped);
        let transfer = series(2, TransactionKind::Transfer, 100_000, "2026-09-01");
        let open = open_occurrences(&[rent, transfer], date("2026-09-01"), date("2026-09-30"));
        let dates: Vec<String> = open.iter().map(|o| o.date.to_string()).collect();
        // Agosto foi pulado; outubro entra pela janela de 10 dias.
        assert_eq!(dates, ["2026-09-05", "2026-10-05"]);
    }

    #[test]
    fn suggests_close_amounts_near_the_due_date() {
        let open = open_occurrences(
            &[
                series(1, TransactionKind::Expense, 200_000, "2026-09-05"),
                series(2, TransactionKind::Income, 800_000, "2026-09-05"),
            ],
            date("2026-09-01"),
            date("2026-09-30"),
        );
        let matches = match_lines(
            &[
                // Aluguel pago dois dias depois, valor exato.
                line("2026-09-07", -200_000),
                // Salário com 1% de diferença.
                line("2026-09-04", 792_000),
                // Mercado: mesmo tipo e perto, mas valor diferente → só opção.
                line("2026-09-06", -45_000),
                // Longe demais do vencimento.
                line("2026-09-20", -200_000),
                None,
            ],
            &open,
        );
        assert_eq!(
            matches[0]
                .suggestion()
                .map(|c| (c.recurring_id, c.occurrence_date.as_str())),
            Some((1, "2026-09-05"))
        );
        assert_eq!(matches[1].suggestion().map(|c| c.recurring_id), Some(2));
        assert_eq!(matches[2].suggested, None);
        assert_eq!(matches[2].candidates.len(), 1);
        assert!(matches[3].candidates.is_empty());
        assert!(matches[4].candidates.is_empty());
    }

    #[test]
    fn a_learned_key_accepts_a_different_amount() {
        let mut energy = series(1, TransactionKind::Expense, 25_000, "2026-09-12");
        energy.import_key = Some("desc:enel".into());
        let open = open_occurrences(&[energy], date("2026-09-01"), date("2026-09-30"));
        let keyed = LineFacts {
            date: date("2026-09-10"),
            amount: -31_780,
            key: Some("desc:enel"),
        };
        let matches = match_lines(&[Some(keyed), line("2026-09-10", -31_780)], &open);
        assert_eq!(matches[0].suggested, Some(0));
        // Sem a chave, o mesmo valor é só uma opção.
        assert_eq!(matches[1].suggested, None);
    }

    #[test]
    fn each_occurrence_is_suggested_once() {
        let open = open_occurrences(
            &[series(1, TransactionKind::Expense, 5_990, "2026-09-15")],
            date("2026-09-01"),
            date("2026-09-30"),
        );
        let matches = match_lines(
            &[line("2026-09-10", -5_990), line("2026-09-15", -5_990)],
            &open,
        );
        // O mais perto do vencimento fica com a sugestão; o outro só vê a opção.
        assert_eq!(matches[0].suggested, None);
        assert_eq!(matches[1].suggested, Some(0));
        assert_eq!(matches[0].candidates.len(), 1);
    }
}
