//! Parcelamentos (Fase 5.4): compras parceladas e o peso delas nas faturas
//! futuras. Fonte da verdade da tela Parcelamentos.
//!
//! Tudo sai dos lançamentos com parcela (`n/N`, vindos da fatura importada).
//! As parcelas de uma mesma compra são agrupadas por conta, data da compra,
//! descrição e número de parcelas; as que ainda não vieram em fatura nenhuma
//! são projetadas mês a mês a partir da mais recente, no mesmo dia de
//! vencimento. Parcela com vencimento antes de hoje conta como paga.

use std::collections::{BTreeMap, HashMap};

use serde::Serialize;

use crate::domain::calendar::CalendarDate;
use crate::domain::finance::period::YearMonth;
use crate::domain::text::fold;

/// Meses de compromisso mostrados (o atual e os seguintes).
pub const COMMITMENT_MONTHS: i64 = 12;
/// Encerradas listadas (as mais recentes).
pub const MAX_FINISHED_LISTED: usize = 50;

/// Parcela lançada (uma linha de `finance_transactions` com `n/N`).
#[derive(Debug, Clone, PartialEq)]
pub struct Parcel {
    pub transaction_id: i64,
    pub account_id: i64,
    pub category_id: Option<i64>,
    pub description: String,
    /// Centavos, positivo.
    pub amount: i64,
    /// Data do lançamento (na fatura, o vencimento).
    pub due_date: CalendarDate,
    pub purchase_date: Option<CalendarDate>,
    pub number: u32,
    pub count: u32,
}

/// Cobrança prevista numa fatura futura que não é parcela (ex.: recorrente no cartão).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StatementCharge {
    pub due_date: CalendarDate,
    pub amount: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallmentPurchase {
    /// Chave estável do agrupamento.
    pub id: String,
    pub account_id: i64,
    pub category_id: Option<i64>,
    pub description: String,
    pub purchase_date: Option<String>,
    /// Valor da parcela (o da mais recente).
    pub installment_amount: i64,
    pub count: u32,
    /// Parcelas com vencimento antes de hoje.
    pub paid: u32,
    /// Próxima parcela a vencer (`paid + 1`), se ainda houver.
    pub current: Option<u32>,
    pub remaining: u32,
    pub remaining_amount: i64,
    /// Soma de todas as parcelas (as que faltam importar, pelo valor da parcela).
    pub total_amount: i64,
    /// Parcelas que já vieram em faturas importadas.
    pub imported: u32,
    pub first_due_date: String,
    pub next_due_date: Option<String>,
    pub final_due_date: String,
    pub finished: bool,
}

/// Quanto das faturas de um mês já está comprometido.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitmentMonth {
    /// `aaaa-mm` (mês do vencimento).
    pub month: String,
    pub installments: i64,
    pub parcels: u32,
    /// Recorrentes no cartão previstas para as faturas do mês.
    pub recurring: i64,
    /// Compras cuja última parcela vence no mês (ids de `InstallmentPurchase`).
    pub ending: Vec<String>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallmentsSummary {
    pub active_purchases: u32,
    pub remaining_parcels: u32,
    pub remaining_amount: i64,
    /// Parcelas + recorrentes no cartão com vencimento no mês atual.
    pub current_month: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallmentsOverview {
    pub today: String,
    /// Ativas (pela última parcela, a que termina antes primeiro) e depois as
    /// encerradas mais recentes.
    pub purchases: Vec<InstallmentPurchase>,
    /// O mês atual e os [`COMMITMENT_MONTHS`] − 1 seguintes.
    pub months: Vec<CommitmentMonth>,
    pub summary: InstallmentsSummary,
    /// `aaaa-mm` da última parcela de todas as compras ativas.
    pub final_month: Option<String>,
    /// Cartões com recorrentes mas sem os dias da fatura: essas recorrentes
    /// ficam fora do compromisso.
    pub cards_without_cycle: Vec<i64>,
}

/// Parcela de uma compra, lançada ou projetada.
#[derive(Debug, Clone, Copy)]
struct ScheduledParcel {
    due_date: CalendarDate,
    amount: i64,
}

/// Separa as parcelas em compras. Mesma conta, data da compra, descrição
/// (sem acentos e caixa) e número de parcelas formam um grupo; se um número de
/// parcela se repete no grupo, são compras iguais diferentes (preferindo
/// juntar as de mesmo valor).
fn group(parcels: &[Parcel]) -> Vec<(String, Vec<&Parcel>)> {
    let mut groups: BTreeMap<String, Vec<&Parcel>> = BTreeMap::new();
    for parcel in parcels {
        let purchase = parcel
            .purchase_date
            .map_or_else(|| "-".to_string(), |date| date.to_string());
        let key = format!(
            "{}:{}:{}:{}",
            parcel.account_id,
            purchase,
            fold(parcel.description.trim()),
            parcel.count
        );
        groups.entry(key).or_default().push(parcel);
    }

    let mut purchases = Vec::new();
    for (key, mut members) in groups {
        members.sort_by_key(|parcel| (parcel.number, parcel.amount, parcel.transaction_id));
        let mut split: Vec<Vec<&Parcel>> = Vec::new();
        for parcel in members {
            let free = |purchase: &&mut Vec<&Parcel>| {
                purchase.iter().all(|other| other.number != parcel.number)
            };
            let slot = split
                .iter_mut()
                .filter(free)
                .enumerate()
                .min_by_key(|(index, purchase)| {
                    let same_amount = purchase.iter().any(|other| other.amount == parcel.amount);
                    (!same_amount, *index)
                })
                .map(|(_, purchase)| purchase);
            match slot {
                Some(purchase) => purchase.push(parcel),
                None => split.push(vec![parcel]),
            }
        }
        let many = split.len() > 1;
        for (index, members) in split.into_iter().enumerate() {
            let id = if many {
                format!("{key}#{}", index + 1)
            } else {
                key.clone()
            };
            purchases.push((id, members));
        }
    }
    purchases
}

/// Vencimento e valor de cada parcela (1..=N): as lançadas como estão; as
/// outras a partir da mais recente, um mês por parcela, no mesmo dia.
fn schedule(members: &[&Parcel]) -> Vec<ScheduledParcel> {
    let latest = members
        .iter()
        .max_by_key(|parcel| (parcel.number, parcel.due_date))
        .expect("grupo nunca vazio");
    let known: HashMap<u32, &Parcel> = members
        .iter()
        .map(|parcel| (parcel.number, *parcel))
        .collect();
    (1..=latest.count)
        .map(|number| match known.get(&number) {
            Some(parcel) => ScheduledParcel {
                due_date: parcel.due_date,
                amount: parcel.amount,
            },
            None => ScheduledParcel {
                due_date: latest.due_date.add_months(
                    i64::from(number) - i64::from(latest.number),
                    latest.due_date.day(),
                ),
                amount: latest.amount,
            },
        })
        .collect()
}

fn to_purchase(
    id: String,
    members: &[&Parcel],
    parcels: &[ScheduledParcel],
    today: CalendarDate,
) -> InstallmentPurchase {
    let latest = members
        .iter()
        .max_by_key(|parcel| (parcel.number, parcel.due_date))
        .expect("grupo nunca vazio");
    let paid = parcels
        .iter()
        .filter(|parcel| parcel.due_date < today)
        .count() as u32;
    let upcoming: Vec<&ScheduledParcel> = parcels
        .iter()
        .filter(|parcel| parcel.due_date >= today)
        .collect();
    let remaining = upcoming.len() as u32;
    let date = |parcel: Option<&ScheduledParcel>| parcel.map(|parcel| parcel.due_date.to_string());
    InstallmentPurchase {
        id,
        account_id: latest.account_id,
        category_id: latest.category_id,
        description: latest.description.clone(),
        purchase_date: latest.purchase_date.map(|date| date.to_string()),
        installment_amount: latest.amount,
        count: latest.count,
        paid,
        current: (remaining > 0).then_some(paid + 1),
        remaining,
        remaining_amount: upcoming.iter().map(|parcel| parcel.amount).sum(),
        total_amount: parcels.iter().map(|parcel| parcel.amount).sum(),
        imported: members.len() as u32,
        first_due_date: date(parcels.first()).unwrap_or_default(),
        next_due_date: date(upcoming.first().copied()),
        final_due_date: date(parcels.last()).unwrap_or_default(),
        finished: remaining == 0,
    }
}

/// Parcela que nenhuma fatura importada trouxe ainda, projetada a partir da
/// mais recente da compra.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProjectedParcel {
    pub account_id: i64,
    pub due_date: CalendarDate,
    pub amount: i64,
}

/// Todas as parcelas projetadas (passadas e futuras); as lançadas ficam de
/// fora, porque já são lançamentos.
pub fn projected_parcels(parcels: &[Parcel]) -> Vec<ProjectedParcel> {
    let mut projected = Vec::new();
    for (_, members) in group(parcels) {
        let account_id = members[0].account_id;
        for (index, parcel) in schedule(&members).into_iter().enumerate() {
            let number = index as u32 + 1;
            if members.iter().all(|member| member.number != number) {
                projected.push(ProjectedParcel {
                    account_id,
                    due_date: parcel.due_date,
                    amount: parcel.amount,
                });
            }
        }
    }
    projected
}

/// Monta a visão dos parcelamentos e o compromisso dos próximos meses.
pub fn build_overview(
    parcels: &[Parcel],
    charges: &[StatementCharge],
    cards_without_cycle: Vec<i64>,
    today: CalendarDate,
) -> InstallmentsOverview {
    let current = YearMonth::of(today);
    let mut months: Vec<CommitmentMonth> = (0..COMMITMENT_MONTHS)
        .map(|offset| CommitmentMonth {
            month: current.add_months(offset).to_string(),
            installments: 0,
            parcels: 0,
            recurring: 0,
            ending: Vec::new(),
        })
        .collect();
    let slot = |date: CalendarDate| {
        let month = YearMonth::of(date);
        (month >= current && month <= current.add_months(COMMITMENT_MONTHS - 1))
            .then(|| (month.to_string(), date))
    };
    let index_of = |months: &[CommitmentMonth], month: &str| {
        months.iter().position(|item| item.month == month)
    };

    let mut purchases = Vec::new();
    for (id, members) in group(parcels) {
        let scheduled = schedule(&members);
        for parcel in &scheduled {
            if let Some((month, _)) = slot(parcel.due_date) {
                if let Some(index) = index_of(&months, &month) {
                    months[index].installments += parcel.amount;
                    months[index].parcels += 1;
                }
            }
        }
        let purchase = to_purchase(id, &members, &scheduled, today);
        if let Some(last) = scheduled.last() {
            if let Some((month, _)) = slot(last.due_date) {
                if let Some(index) = index_of(&months, &month) {
                    months[index].ending.push(purchase.id.clone());
                }
            }
        }
        purchases.push(purchase);
    }
    for charge in charges {
        if let Some((month, _)) = slot(charge.due_date) {
            if let Some(index) = index_of(&months, &month) {
                months[index].recurring += charge.amount;
            }
        }
    }

    let active: Vec<&InstallmentPurchase> = purchases.iter().filter(|p| !p.finished).collect();
    let summary = InstallmentsSummary {
        active_purchases: active.len() as u32,
        remaining_parcels: active.iter().map(|p| p.remaining).sum(),
        remaining_amount: active.iter().map(|p| p.remaining_amount).sum(),
        current_month: months
            .first()
            .map_or(0, |month| month.installments + month.recurring),
    };
    let final_month = active
        .iter()
        .map(|p| p.final_due_date.as_str())
        .max()
        .map(|date| date[..7].to_string());

    let (mut ongoing, mut finished): (Vec<_>, Vec<_>) = purchases
        .into_iter()
        .partition(|purchase| !purchase.finished);
    ongoing.sort_by(|a, b| {
        (&a.final_due_date, &a.description, &a.id).cmp(&(&b.final_due_date, &b.description, &b.id))
    });
    finished.sort_by(|a, b| {
        b.final_due_date
            .cmp(&a.final_due_date)
            .then(a.id.cmp(&b.id))
    });
    finished.truncate(MAX_FINISHED_LISTED);
    ongoing.extend(finished);

    InstallmentsOverview {
        today: today.to_string(),
        purchases: ongoing,
        months,
        summary,
        final_month,
        cards_without_cycle,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(value: &str) -> CalendarDate {
        CalendarDate::parse(value).unwrap()
    }

    fn parcel(id: i64, description: &str, number: u32, count: u32, due: &str) -> Parcel {
        Parcel {
            transaction_id: id,
            account_id: 1,
            category_id: None,
            description: description.into(),
            amount: 10_000,
            due_date: date(due),
            purchase_date: Some(date("2026-06-03")),
            number,
            count,
        }
    }

    #[test]
    fn projects_the_remaining_parcels_of_a_purchase() {
        // Geladeira em 10x: vieram a 3ª e a 4ª parcelas (faturas de setembro e outubro).
        let parcels = [
            parcel(1, "LOJA EXEMPLO", 3, 10, "2026-09-05"),
            parcel(2, "Loja Exemplo", 4, 10, "2026-10-05"),
        ];
        let overview = build_overview(&parcels, &[], Vec::new(), date("2026-09-29"));
        assert_eq!(overview.purchases.len(), 1);
        let fridge = &overview.purchases[0];
        assert_eq!(fridge.count, 10);
        // 1ª a 3ª já venceram (a 1ª e a 2ª projetadas para trás).
        assert_eq!(
            (fridge.paid, fridge.current, fridge.remaining),
            (3, Some(4), 7)
        );
        assert_eq!(fridge.remaining_amount, 70_000);
        assert_eq!(fridge.total_amount, 100_000);
        assert_eq!(fridge.imported, 2);
        assert_eq!(fridge.first_due_date, "2026-07-05");
        assert_eq!(fridge.next_due_date.as_deref(), Some("2026-10-05"));
        assert_eq!(fridge.final_due_date, "2027-04-05");
        assert!(!fridge.finished);

        // Setembro (atual) tem a 3ª; outubro a abril, uma parcela por mês.
        let months: Vec<(&str, i64)> = overview
            .months
            .iter()
            .map(|month| (month.month.as_str(), month.installments))
            .collect();
        assert_eq!(months[0], ("2026-09", 10_000));
        assert_eq!(months[7], ("2027-04", 10_000));
        assert_eq!(months[8], ("2027-05", 0));
        assert_eq!(overview.months[7].ending, vec![fridge.id.clone()]);
        assert_eq!(overview.final_month.as_deref(), Some("2027-04"));
        assert_eq!(
            overview.summary,
            InstallmentsSummary {
                active_purchases: 1,
                remaining_parcels: 7,
                remaining_amount: 70_000,
                current_month: 10_000,
            }
        );
    }

    #[test]
    fn projects_only_the_parcels_not_imported() {
        let parcels = [
            parcel(1, "LOJA EXEMPLO", 3, 5, "2026-09-05"),
            parcel(2, "LOJA EXEMPLO", 4, 5, "2026-10-05"),
        ];
        let dates: Vec<String> = projected_parcels(&parcels)
            .iter()
            .map(|parcel| parcel.due_date.to_string())
            .collect();
        assert_eq!(dates, vec!["2026-07-05", "2026-08-05", "2026-11-05"]);
    }

    #[test]
    fn separates_purchases_and_finishes_them() {
        let mut other_card = parcel(3, "LOJA EXEMPLO", 1, 2, "2026-09-05");
        other_card.account_id = 2;
        let mut first_split = parcel(4, "PADARIA", 1, 2, "2026-09-05");
        first_split.amount = 5_001;
        let mut twin = parcel(5, "PADARIA", 1, 2, "2026-09-05");
        twin.amount = 3_000;
        let mut twin_second = parcel(6, "PADARIA", 2, 2, "2026-10-05");
        twin_second.amount = 3_000;
        let parcels = [
            parcel(1, "LOJA EXEMPLO", 1, 2, "2026-09-05"),
            other_card,
            // Duas compras iguais no mesmo dia, de valores diferentes.
            first_split,
            twin,
            twin_second,
            // Já terminou.
            parcel(7, "CURSO", 3, 3, "2026-08-05"),
        ];
        let overview = build_overview(&parcels, &[], Vec::new(), date("2026-09-29"));
        assert_eq!(overview.purchases.len(), 5);
        let padaria: Vec<_> = overview
            .purchases
            .iter()
            .filter(|p| p.description == "PADARIA")
            .collect();
        assert_eq!(padaria.len(), 2);
        let twin = padaria
            .iter()
            .find(|p| p.installment_amount == 3_000)
            .unwrap();
        assert_eq!(twin.imported, 2);
        let course = overview.purchases.last().unwrap();
        assert_eq!(course.description, "CURSO");
        assert!(course.finished);
        assert_eq!(
            (course.paid, course.remaining, course.current),
            (3, 0, None)
        );
        assert_eq!(overview.summary.active_purchases, 4);
    }

    #[test]
    fn adds_card_charges_to_the_commitment() {
        let overview = build_overview(
            &[],
            &[
                StatementCharge {
                    due_date: date("2026-10-05"),
                    amount: 5_590,
                },
                // Antes do mês atual ou depois do horizonte: fora.
                StatementCharge {
                    due_date: date("2026-08-05"),
                    amount: 1,
                },
                StatementCharge {
                    due_date: date("2027-09-05"),
                    amount: 1,
                },
            ],
            vec![4],
            date("2026-09-29"),
        );
        assert_eq!(overview.months.len(), 12);
        assert_eq!(overview.months[1].recurring, 5_590);
        assert_eq!(
            overview.months.iter().map(|m| m.recurring).sum::<i64>(),
            5_590
        );
        assert_eq!(overview.cards_without_cycle, vec![4]);
        assert_eq!(overview.final_month, None);
    }
}
