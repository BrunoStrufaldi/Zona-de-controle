//! Projeção dos próximos meses (Fase 7.2): saldo das contas do dia a dia ao fim
//! de cada mês e o peso das parcelas. Fonte da verdade da aba Projeção.
//!
//! Decisão do usuário: previsto = valores conhecidos (lançamentos já
//! registrados para frente, recorrentes em aberto e parcelas ainda não
//! importadas) + a média dos últimos meses do resto (gastos e receitas
//! avulsos), sempre separada e mostrada como estimativa. Transferências
//! (pagamento de fatura, aplicações) só movem dinheiro e ficam de fora; as
//! contas de investimentos não entram no saldo.

use serde::Serialize;

use crate::domain::calendar::CalendarDate;
use crate::domain::finance::accounts::{AccountKind, FinanceAccount};
use crate::domain::finance::analytics::BalanceFlow;
use crate::domain::finance::installments::{projected_parcels, Parcel};
use crate::domain::finance::period::YearMonth;
use crate::domain::finance::recurring::Series;
use crate::domain::finance::TransactionKind;

/// Meses projetados depois do atual.
pub const PROJECTION_MONTHS: i64 = 6;
/// Meses completos usados na média da estimativa.
pub const ESTIMATE_MONTHS: i64 = 6;

/// Entrada ou saída (sem transferências) como está no banco.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LedgerRow {
    pub account_id: i64,
    pub kind: TransactionKind,
    pub amount: i64,
    pub date: CalendarDate,
    pub pending: bool,
    /// Parcela `n/N` de uma compra.
    pub installment: bool,
    /// Vinculado a um vencimento de recorrente.
    pub recurring: bool,
}

impl LedgerRow {
    /// Nem parcela nem recorrente: o que a estimativa representa.
    fn variable(&self) -> bool {
        !self.installment && !self.recurring
    }
}

/// Entradas ou saídas previstas de um mês, por origem.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectedFlows {
    /// Vencimentos em aberto e lançamentos vinculados a recorrentes.
    pub recurring: i64,
    /// Parcelas (as importadas com data futura e as projetadas).
    pub installments: i64,
    /// Outros lançamentos já registrados: com data futura ou ainda pendentes.
    pub scheduled: i64,
    /// Estimativa: a média do que não é recorrente nem parcela, menos o que já
    /// está lançado no mês.
    pub estimated: i64,
}

impl ProjectedFlows {
    pub fn known(&self) -> i64 {
        self.recurring + self.installments + self.scheduled
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionMonth {
    /// `aaaa-mm`; o primeiro é o mês atual (só o que falta dele).
    pub month: String,
    pub income: ProjectedFlows,
    pub expenses: ProjectedFlows,
    /// Saldo ao fim do mês só com os valores conhecidos.
    pub balance_known: i64,
    /// Saldo ao fim do mês com a estimativa.
    pub balance: i64,
}

/// Base da estimativa: médias por mês dos meses completos usados.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimateBase {
    /// 0 = sem histórico: nada é estimado.
    pub months: u32,
    pub income: i64,
    pub expenses: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinanceProjection {
    pub today: String,
    /// Saldo de hoje das contas do dia a dia (só pagos até hoje; cartões negativos).
    pub start_balance: i64,
    pub months: Vec<ProjectionMonth>,
    pub estimate: EstimateBase,
    /// `aaaa-mm` da última parcela prevista de todas as compras.
    pub installments_final_month: Option<String>,
    /// Cartões com recorrentes mas sem os dias da fatura: as cobranças entram
    /// na data da compra, não no vencimento da fatura.
    pub cards_without_cycle: Vec<i64>,
    /// Vencimentos de recorrentes (fora do cartão) nos meses da base sem
    /// lançamento vinculado nem pulados. Se foram pagos sem vínculo, o
    /// lançamento entra na média dos avulsos e a projeção conta duas vezes.
    pub unlinked_recurring: u32,
}

pub struct ProjectionInput<'a> {
    pub accounts: &'a [FinanceAccount],
    /// Contas que guardam ativos (contam como de investimentos).
    pub asset_accounts: &'a [i64],
    /// Todos os lançamentos pagos, por conta e dia (saldo de hoje).
    pub flows: &'a [BalanceFlow],
    /// Entradas e saídas desde o início da base da estimativa, mais as
    /// pendentes de antes dela.
    pub ledger: &'a [LedgerRow],
    pub series: &'a [Series],
    pub parcels: &'a [Parcel],
}

/// Primeiro dia da base da estimativa (lançamentos a ler a partir dele).
pub fn ledger_start(today: CalendarDate) -> CalendarDate {
    YearMonth::of(today)
        .add_months(-ESTIMATE_MONTHS)
        .first_day()
}

pub fn build_projection(input: &ProjectionInput<'_>, today: CalendarDate) -> FinanceProjection {
    let current = YearMonth::of(today);
    let last = current.add_months(PROJECTION_MONTHS);
    let horizon = last.last_day();
    let counted = |account_id: i64| {
        input.accounts.iter().any(|account| {
            account.id == account_id
                && account.kind != AccountKind::Investment
                && !input.asset_accounts.contains(&account_id)
        })
    };

    let start_balance: i64 = input
        .accounts
        .iter()
        .filter(|account| counted(account.id))
        .map(|account| account.opening_balance)
        .sum::<i64>()
        + input
            .flows
            .iter()
            .filter(|(account, date, _)| counted(*account) && *date <= today)
            .map(|(_, _, amount)| amount)
            .sum::<i64>();

    let mut months: Vec<ProjectionMonth> = (0..=PROJECTION_MONTHS)
        .map(|offset| ProjectionMonth {
            month: current.add_months(offset).to_string(),
            income: ProjectedFlows::default(),
            expenses: ProjectedFlows::default(),
            balance_known: 0,
            balance: 0,
        })
        .collect();
    // Índice do mês em que o dinheiro se move (atrasados/pendentes: o atual).
    let slot = |date: CalendarDate| -> Option<usize> {
        let month = YearMonth::of(date.max(today));
        (month <= last).then(|| current.months_until(month) as usize)
    };

    // Lançamentos: pendentes (mesmo atrasados) e os com data futura.
    for row in input.ledger.iter().filter(|row| counted(row.account_id)) {
        if !(row.pending || row.date > today) {
            continue;
        }
        let Some(index) = slot(row.date) else {
            continue;
        };
        let flows = match row.kind {
            TransactionKind::Income => &mut months[index].income,
            TransactionKind::Expense => &mut months[index].expenses,
            TransactionKind::Transfer => continue,
        };
        if row.installment {
            flows.installments += row.amount;
        } else if row.recurring {
            flows.recurring += row.amount;
        } else {
            flows.scheduled += row.amount;
        }
    }

    // Parcelas que ainda não vieram em fatura.
    let projected = projected_parcels(input.parcels);
    for parcel in projected
        .iter()
        .filter(|parcel| counted(parcel.account_id) && parcel.due_date > today)
    {
        if let Some(index) = slot(parcel.due_date) {
            months[index].expenses.installments += parcel.amount;
        }
    }

    // Recorrentes em aberto.
    for series in input
        .series
        .iter()
        .filter(|series| counted(series.account_id))
    {
        for charge in series.upcoming_open(today, horizon) {
            let Some(index) = slot(charge.due_date) else {
                continue;
            };
            match series.kind {
                TransactionKind::Income => months[index].income.recurring += charge.amount,
                TransactionKind::Expense => months[index].expenses.recurring += charge.amount,
                TransactionKind::Transfer => {}
            }
        }
    }

    // Estimativa: média dos meses completos da base, desde o primeiro registro.
    let estimate = estimate_base(input, current, &counted);
    if estimate.months > 0 {
        for (offset, month) in months.iter_mut().enumerate() {
            let target = current.add_months(offset as i64);
            let already = |kind: TransactionKind| -> i64 {
                input
                    .ledger
                    .iter()
                    .filter(|row| {
                        counted(row.account_id)
                            && row.kind == kind
                            && row.variable()
                            && YearMonth::of(row.date) == target
                    })
                    .map(|row| row.amount)
                    .sum()
            };
            month.income.estimated = (estimate.income - already(TransactionKind::Income)).max(0);
            month.expenses.estimated =
                (estimate.expenses - already(TransactionKind::Expense)).max(0);
        }
    }

    let (mut known, mut estimated) = (start_balance, start_balance);
    for month in &mut months {
        known += month.income.known() - month.expenses.known();
        estimated += month.income.known() + month.income.estimated
            - month.expenses.known()
            - month.expenses.estimated;
        month.balance_known = known;
        month.balance = estimated;
    }

    let installments_final_month = input
        .ledger
        .iter()
        .filter(|row| row.installment && row.date >= today && counted(row.account_id))
        .map(|row| row.date)
        .chain(
            projected
                .iter()
                .filter(|parcel| parcel.due_date >= today && counted(parcel.account_id))
                .map(|parcel| parcel.due_date),
        )
        .max()
        .map(|date| YearMonth::of(date).to_string());

    let mut cards_without_cycle: Vec<i64> = input
        .series
        .iter()
        .filter(|series| {
            series.on_card
                && series.card_cycle.is_none()
                && series.kind == TransactionKind::Expense
                && series
                    .schedule
                    .last_date()
                    .map_or(true, |last| last >= today)
        })
        .map(|series| series.account_id)
        .collect();
    cards_without_cycle.sort_unstable();
    cards_without_cycle.dedup();

    let base_start = ledger_start(today);
    let unlinked_recurring = input
        .series
        .iter()
        .filter(|series| {
            !series.on_card
                && series.kind != TransactionKind::Transfer
                && counted(series.account_id)
        })
        .map(|series| {
            series
                .schedule
                .dates()
                .skip_while(|date| *date < base_start)
                .take_while(|date| *date < today)
                .filter(|date| !series.resolved.contains_key(date))
                .count() as u32
        })
        .sum();

    FinanceProjection {
        today: today.to_string(),
        start_balance,
        months,
        estimate,
        installments_final_month,
        cards_without_cycle,
        unlinked_recurring,
    }
}

/// Médias por mês do que não é recorrente nem parcela, nos meses completos da
/// base a partir do primeiro registro (antes dele não houve mês sem gastos,
/// só falta de registro).
fn estimate_base(
    input: &ProjectionInput<'_>,
    current: YearMonth,
    counted: &dyn Fn(i64) -> bool,
) -> EstimateBase {
    let first = input
        .flows
        .iter()
        .map(|(_, date, _)| *date)
        .chain(input.ledger.iter().map(|row| row.date))
        .min();
    let Some(first) = first.map(YearMonth::of) else {
        return EstimateBase::default();
    };
    let base: Vec<YearMonth> = (1..=ESTIMATE_MONTHS)
        .map(|back| current.add_months(-back))
        .filter(|month| *month >= first)
        .collect();
    if base.is_empty() {
        return EstimateBase::default();
    }
    let count = base.len() as i64;
    let average = |kind: TransactionKind| -> i64 {
        let total: i64 = input
            .ledger
            .iter()
            .filter(|row| {
                counted(row.account_id)
                    && row.kind == kind
                    && row.variable()
                    && base.contains(&YearMonth::of(row.date))
            })
            .map(|row| row.amount)
            .sum();
        (total + count / 2).div_euclid(count)
    };
    EstimateBase {
        months: base.len() as u32,
        income: average(TransactionKind::Income),
        expenses: average(TransactionKind::Expense),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::finance::cards::CardCycle;
    use crate::domain::finance::recurring::{RecurringRule, Schedule};
    use crate::domain::task_categories::CategoryColor;
    use crate::domain::task_recurrence::RecurrenceFrequency;
    use std::collections::BTreeMap;

    fn date(value: &str) -> CalendarDate {
        CalendarDate::parse(value).unwrap()
    }

    fn account(id: i64, kind: AccountKind, opening_balance: i64) -> FinanceAccount {
        FinanceAccount {
            id,
            name: format!("Conta {id}"),
            kind,
            color: CategoryColor::Slate,
            opening_balance,
            balance: 0,
            transaction_count: 0,
            closing_day: None,
            due_day: None,
        }
    }

    fn row(kind: TransactionKind, amount: i64, on: &str) -> LedgerRow {
        LedgerRow {
            account_id: 1,
            kind,
            amount,
            date: date(on),
            pending: false,
            installment: false,
            recurring: false,
        }
    }

    fn monthly(account_id: i64, kind: TransactionKind, amount: i64, start: &str) -> Series {
        Series {
            id: 1,
            kind,
            description: "Série".into(),
            amount,
            account_id,
            transfer_account_id: None,
            category_id: None,
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

    const TODAY: &str = "2026-09-20";

    #[test]
    fn projects_known_flows_and_the_estimate_separately() {
        use TransactionKind::{Expense, Income};
        let accounts = [
            account(1, AccountKind::Checking, 0),
            account(2, AccountKind::CreditCard, 0),
            account(3, AccountKind::Investment, 0),
        ];
        let flows = [
            (1, date("2026-03-05"), 500_000),
            // Aplicação: sai da corrente e entra na de investimentos (fora do saldo).
            (1, date("2026-09-06"), -100_000),
            (3, date("2026-09-06"), 100_000),
            // Paga com data futura (fatura que vence em outubro): ainda não conta hoje.
            (2, date("2026-10-05"), -30_000),
        ];
        let mut pending_bill = row(Expense, 15_000, "2026-09-12");
        pending_bill.pending = true;
        let mut future_card = row(Expense, 30_000, "2026-10-05");
        future_card.account_id = 2;
        let mut parcel_row = row(Expense, 10_000, "2026-10-05");
        parcel_row.account_id = 2;
        parcel_row.installment = true;
        let ledger = [
            // Base da estimativa: março a agosto, gastos avulsos de 60 mil/mês e um bico de 6 mil.
            row(Expense, 60_000, "2026-03-15"),
            row(Expense, 60_000, "2026-04-15"),
            row(Expense, 60_000, "2026-05-15"),
            row(Expense, 60_000, "2026-06-15"),
            row(Expense, 60_000, "2026-07-15"),
            row(Expense, 60_000, "2026-08-15"),
            row(Income, 36_000, "2026-08-20"),
            // Setembro: 20 mil avulsos já gastos e uma conta pendente atrasada.
            row(Expense, 20_000, "2026-09-10"),
            pending_bill,
            // Fatura de outubro já importada: uma compra avulsa e uma parcela (1/3).
            future_card,
            parcel_row,
        ];
        let parcels = [Parcel {
            transaction_id: 99,
            account_id: 2,
            category_id: None,
            description: "LOJA".into(),
            amount: 10_000,
            due_date: date("2026-10-05"),
            purchase_date: Some(date("2026-09-01")),
            number: 1,
            count: 3,
        }];
        let series = [
            monthly(1, Income, 800_000, "2026-01-05"),
            monthly(1, Expense, 200_000, "2026-01-10"),
            // Recorrente de outra conta de investimentos: fora.
            monthly(3, Income, 1_000, "2026-01-01"),
        ];
        let input = ProjectionInput {
            accounts: &accounts,
            asset_accounts: &[],
            flows: &flows,
            ledger: &ledger,
            series: &series,
            parcels: &parcels,
        };
        let projection = build_projection(&input, date(TODAY));

        assert_eq!(projection.start_balance, 400_000);
        assert_eq!(
            projection.estimate,
            EstimateBase {
                months: 6,
                income: 6_000,
                expenses: 60_000
            }
        );
        assert_eq!(projection.months.len(), 7);

        let september = &projection.months[0];
        assert_eq!(september.month, "2026-09");
        // Salário e aluguel de setembro já passaram (e estão atrasados sem vínculo): fora.
        assert_eq!(september.expenses.recurring, 0);
        assert_eq!(september.expenses.scheduled, 15_000);
        // Faltam 60 − 20 − 15 = 25 mil da média.
        assert_eq!(september.expenses.estimated, 25_000);
        assert_eq!(september.income.estimated, 6_000);
        assert_eq!(september.balance_known, 385_000);
        assert_eq!(september.balance, 385_000 + 6_000 - 25_000);

        let october = &projection.months[1];
        assert_eq!(october.income.recurring, 800_000);
        assert_eq!(october.expenses.recurring, 200_000);
        assert_eq!(october.expenses.installments, 10_000);
        assert_eq!(october.expenses.scheduled, 30_000);
        // A compra da fatura já conta dentro da média.
        assert_eq!(october.expenses.estimated, 30_000);
        assert_eq!(october.balance_known, 385_000 + 800_000 - 240_000);

        // Parcelas 2/3 e 3/3 projetadas; a última em dezembro.
        assert_eq!(projection.months[2].expenses.installments, 10_000);
        assert_eq!(projection.months[3].expenses.installments, 10_000);
        assert_eq!(projection.months[4].expenses.installments, 0);
        assert_eq!(
            projection.installments_final_month.as_deref(),
            Some("2026-12")
        );
        // Salário e aluguel de março a setembro sem vínculo: 7 + 7 vencimentos.
        assert_eq!(projection.unlinked_recurring, 14);
        let march = projection.months.last().unwrap();
        assert_eq!(march.month, "2027-03");
        assert_eq!(march.expenses.estimated, 60_000);
    }

    #[test]
    fn without_history_nothing_is_estimated() {
        let accounts = [account(1, AccountKind::Checking, 50_000)];
        let mut series = monthly(1, TransactionKind::Expense, 5_590, "2026-08-15");
        series.on_card = true;
        let input = ProjectionInput {
            accounts: &accounts,
            asset_accounts: &[],
            flows: &[],
            ledger: &[],
            series: std::slice::from_ref(&series),
            parcels: &[],
        };
        let projection = build_projection(&input, date(TODAY));
        assert_eq!(projection.estimate, EstimateBase::default());
        assert!(projection.months.iter().all(|m| m.expenses.estimated == 0));
        assert_eq!(projection.start_balance, 50_000);
        // Cartão sem os dias da fatura: avisado, cobrança na data da compra.
        assert_eq!(projection.cards_without_cycle, vec![1]);
        // No cartão, o vínculo vem com a fatura: não conta como sem vínculo.
        assert_eq!(projection.unlinked_recurring, 0);
        assert_eq!(projection.months[1].expenses.recurring, 5_590);

        series.card_cycle = Some(CardCycle {
            closing_day: 28,
            due_day: 5,
        });
        let input = ProjectionInput {
            accounts: &accounts,
            asset_accounts: &[],
            flows: &[],
            ledger: &[],
            series: std::slice::from_ref(&series),
            parcels: &[],
        };
        let projection = build_projection(&input, date(TODAY));
        assert!(projection.cards_without_cycle.is_empty());
        // A cobrança de 15/09 vence em 05/10, assim como a de agosto já vencida em 05/09 não conta.
        assert_eq!(projection.months[0].expenses.recurring, 0);
        assert_eq!(projection.months[1].expenses.recurring, 5_590);
    }
}
