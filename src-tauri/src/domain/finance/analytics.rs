//! Análise do histórico financeiro (Fase 7.1): receita x despesas e sobra por
//! mês, despesas por categoria mês a mês e evolução do patrimônio (contas +
//! investimentos). Fonte da verdade da tela Analytics.
//!
//! Receita e despesas seguem a Visão Geral: incluem os pendentes e deixam as
//! transferências de fora (aplicar não é gasto). O patrimônio segue a 6.1:
//! saldos só com lançamentos pagos e a carteira pelo valor informado
//! (`value_on`), sem contar duas vezes o dinheiro aplicado.

use serde::Serialize;

use crate::domain::calendar::CalendarDate;
use crate::domain::finance::accounts::{AccountKind, FinanceAccount};
use crate::domain::finance::investments::{value_on, AssetHistory, MovementKind};
use crate::domain::finance::overview::CategoryTotal;
use crate::domain::finance::period::{DateRange, YearMonth};
use crate::domain::finance::TransactionKind;
use crate::error::{AppError, AppResult};

/// Maior período aceito, em meses.
pub const MAX_ANALYTICS_MONTHS: i64 = 36;

/// Meses de `from` a `to` (inclusivos).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MonthSpan {
    pub from: YearMonth,
    pub to: YearMonth,
}

impl MonthSpan {
    pub fn parse(from: &str, to: &str) -> AppResult<Self> {
        let span = Self {
            from: YearMonth::parse(from)?,
            to: YearMonth::parse(to)?,
        };
        if span.to < span.from {
            return Err(AppError::Validation(
                "o mês final é anterior ao inicial".into(),
            ));
        }
        if span.len() > MAX_ANALYTICS_MONTHS {
            return Err(AppError::Validation(format!(
                "o período pode ter no máximo {MAX_ANALYTICS_MONTHS} meses"
            )));
        }
        Ok(span)
    }

    pub fn len(self) -> i64 {
        self.from.months_until(self.to) + 1
    }

    pub fn months(self) -> Vec<YearMonth> {
        (0..self.len()).map(|n| self.from.add_months(n)).collect()
    }

    /// Período de mesmo tamanho imediatamente antes.
    pub fn previous(self) -> Self {
        Self {
            from: self.from.add_months(-self.len()),
            to: self.from.add_months(-1),
        }
    }

    pub fn range(self) -> DateRange {
        DateRange {
            from: self.from.first_day(),
            to: self.to.last_day(),
        }
    }
}

/// Patrimônio ao fim de um mês (no mês atual, hoje).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetWorthPoint {
    /// Saldos das contas que não são de investimentos (cartões entram negativos).
    pub accounts: i64,
    /// Carteira pelo valor informado + dinheiro parado nas contas de investimentos.
    pub investments: i64,
    pub total: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsMonth {
    /// `aaaa-mm`.
    pub month: String,
    pub income: i64,
    pub expenses: i64,
    /// Receita − despesas.
    pub net: i64,
    /// `None` antes do primeiro registro e depois do mês atual.
    pub net_worth: Option<NetWorthPoint>,
}

/// Despesas de uma categoria (`None` = sem categoria) no período.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryTrend {
    pub category_id: Option<i64>,
    pub total: i64,
    /// Total no período anterior de mesmo tamanho.
    pub previous_total: i64,
    /// Um valor por mês do período, na ordem de `months`.
    pub months: Vec<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsTotals {
    pub income: i64,
    pub expenses: i64,
    pub net: i64,
    /// Médias por mês dos `average_months` meses completos do período (o mês
    /// atual, ainda em andamento, fica de fora quando há outros).
    pub average_income: i64,
    pub average_expenses: i64,
    pub average_months: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinanceAnalytics {
    /// `aaaa-mm`.
    pub from: String,
    pub to: String,
    pub today: String,
    pub totals: AnalyticsTotals,
    pub months: Vec<AnalyticsMonth>,
    /// Maior total primeiro; só categorias com despesa no período.
    pub categories: Vec<CategoryTrend>,
}

/// Movimento de saldo já pago: `(conta, data, valor com sinal)`.
pub type BalanceFlow = (i64, CalendarDate, i64);

/// O que a análise lê do banco.
pub struct AnalyticsInput<'a> {
    /// `(aaaa-mm, tipo, total)` do período, sem transferências.
    pub monthly: &'a [(String, TransactionKind, i64)],
    /// `(aaaa-mm, categoria, total)` das despesas do período.
    pub category_months: &'a [(String, Option<i64>, i64)],
    /// Despesas por categoria no período anterior.
    pub previous_categories: &'a [CategoryTotal],
    pub accounts: &'a [FinanceAccount],
    /// Todos os lançamentos pagos, agrupados por conta e dia.
    pub flows: &'a [BalanceFlow],
    pub assets: &'a [AssetHistory],
}

pub fn build_analytics(
    span: MonthSpan,
    input: &AnalyticsInput<'_>,
    today: CalendarDate,
) -> FinanceAnalytics {
    let current = YearMonth::of(today);
    let first_record = first_record(input);

    let months: Vec<AnalyticsMonth> = span
        .months()
        .into_iter()
        .map(|month| {
            let key = month.to_string();
            let sum = |wanted: TransactionKind| -> i64 {
                input
                    .monthly
                    .iter()
                    .filter(|(row, kind, _)| *row == key && *kind == wanted)
                    .map(|(_, _, total)| total)
                    .sum()
            };
            let (income, expenses) = (sum(TransactionKind::Income), sum(TransactionKind::Expense));
            let recorded = first_record.is_some_and(|first| YearMonth::of(first) <= month);
            let net_worth = (recorded && month <= current)
                .then(|| net_worth_on(input, month.last_day().min(today)));
            AnalyticsMonth {
                month: key,
                income,
                expenses,
                net: income - expenses,
                net_worth,
            }
        })
        .collect();

    FinanceAnalytics {
        from: span.from.to_string(),
        to: span.to.to_string(),
        today: today.to_string(),
        totals: totals(&months, span, current, first_record.map(YearMonth::of)),
        categories: categories(span, input),
        months,
    }
}

/// Totais e médias. A média usa os meses completos desde o primeiro registro:
/// meses antes de o usuário começar a registrar não são meses sem gastos.
fn totals(
    months: &[AnalyticsMonth],
    span: MonthSpan,
    current: YearMonth,
    first_record: Option<YearMonth>,
) -> AnalyticsTotals {
    let income: i64 = months.iter().map(|month| month.income).sum();
    let expenses: i64 = months.iter().map(|month| month.expenses).sum();
    let dated: Vec<(YearMonth, &AnalyticsMonth)> = span.months().into_iter().zip(months).collect();
    // Primeiro mês com dado: registro que muda saldo ou lançamento (mesmo pendente) no período.
    let first_moved = dated
        .iter()
        .find(|(_, row)| row.income != 0 || row.expenses != 0)
        .map(|(month, _)| *month);
    let start = match (first_record, first_moved) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (a, b) => a.or(b),
    };
    let pick = |keep: &dyn Fn(YearMonth) -> bool| -> Vec<&AnalyticsMonth> {
        dated
            .iter()
            .filter(|(month, _)| start.is_some_and(|first| *month >= first) && keep(*month))
            .map(|(_, row)| *row)
            .collect()
    };
    // Meses completos; sem nenhum, inclui o atual; sem registro, o período inteiro.
    let mut averaged = pick(&|month| month < current);
    if averaged.is_empty() {
        averaged = pick(&|month| month <= current);
    }
    if averaged.is_empty() {
        averaged = months.iter().collect();
    }
    let count = averaged.len().max(1) as i64;
    let average = |value: fn(&AnalyticsMonth) -> i64| {
        let total: i64 = averaged.iter().map(|row| value(row)).sum();
        // Arredonda para o centavo mais próximo.
        (total + count / 2).div_euclid(count)
    };
    AnalyticsTotals {
        income,
        expenses,
        net: income - expenses,
        average_income: average(|row| row.income),
        average_expenses: average(|row| row.expenses),
        average_months: averaged.len() as u32,
    }
}

fn categories(span: MonthSpan, input: &AnalyticsInput<'_>) -> Vec<CategoryTrend> {
    let keys: Vec<String> = span.months().iter().map(ToString::to_string).collect();
    let mut trends: Vec<CategoryTrend> = Vec::new();
    for (month, category_id, total) in input.category_months {
        let Some(index) = keys.iter().position(|key| key == month) else {
            continue;
        };
        let trend = match trends
            .iter_mut()
            .position(|trend| trend.category_id == *category_id)
        {
            Some(found) => &mut trends[found],
            None => {
                trends.push(CategoryTrend {
                    category_id: *category_id,
                    total: 0,
                    previous_total: 0,
                    months: vec![0; keys.len()],
                });
                trends.last_mut().expect("acabou de entrar")
            }
        };
        trend.months[index] += total;
        trend.total += total;
    }
    for trend in &mut trends {
        trend.previous_total = input
            .previous_categories
            .iter()
            .filter(|previous| previous.category_id == trend.category_id)
            .map(|previous| previous.total)
            .sum();
    }
    trends.retain(|trend| trend.total > 0);
    trends.sort_by(|a, b| {
        b.total
            .cmp(&a.total)
            .then_with(|| a.category_id.cmp(&b.category_id))
    });
    trends
}

/// Data do primeiro registro que muda o patrimônio (lançamento pago,
/// movimentação ou valor informado). Antes dele o patrimônio é desconhecido.
fn first_record(input: &AnalyticsInput<'_>) -> Option<CalendarDate> {
    let flows = input.flows.iter().map(|(_, date, _)| *date);
    let assets = input.assets.iter().flat_map(|(_, movements, valuations)| {
        movements
            .iter()
            .map(|movement| movement.date)
            .chain(valuations.iter().map(|valuation| valuation.date))
    });
    flows.chain(assets).min()
}

/// Patrimônio ao fim do dia `on`, como na 6.1: contas + dinheiro nas contas
/// de investimentos fora da carteira + carteira. Cada aplicação sai do saldo
/// da conta de investimentos e entra na carteira, então o dinheiro aplicado
/// conta uma vez só.
fn net_worth_on(input: &AnalyticsInput<'_>, on: CalendarDate) -> NetWorthPoint {
    let holds_assets = |id: i64| {
        input
            .assets
            .iter()
            .any(|(asset, _, _)| asset.account_id == id)
    };
    let mut point = NetWorthPoint {
        accounts: 0,
        investments: 0,
        total: 0,
    };
    for account in input.accounts {
        let balance = account.opening_balance
            + input
                .flows
                .iter()
                .filter(|(id, date, _)| *id == account.id && *date <= on)
                .map(|(_, _, amount)| amount)
                .sum::<i64>();
        if account.kind == AccountKind::Investment || holds_assets(account.id) {
            point.investments += balance;
        } else {
            point.accounts += balance;
        }
    }
    for (_, movements, valuations) in input.assets {
        let value = value_on(movements, valuations, Some(on)).value;
        let invested: i64 = movements
            .iter()
            .filter(|movement| movement.date <= on)
            .map(|movement| match movement.kind {
                MovementKind::Contribution => movement.amount,
                MovementKind::Withdrawal => -movement.amount,
                MovementKind::Income => 0,
            })
            .sum();
        // Saldo da conta − aplicado líquido (dinheiro fora da carteira) + valor.
        point.investments += value - invested;
    }
    point.total = point.accounts + point.investments;
    point
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::finance::investments::{Asset, AssetClass, Movement, Valuation};
    use crate::domain::task_categories::CategoryColor;

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

    fn empty_input<'a>(accounts: &'a [FinanceAccount]) -> AnalyticsInput<'a> {
        AnalyticsInput {
            monthly: &[],
            category_months: &[],
            previous_categories: &[],
            accounts,
            flows: &[],
            assets: &[],
        }
    }

    #[test]
    fn validates_and_walks_the_span() {
        let span = MonthSpan::parse("2025-10", "2026-09").unwrap();
        assert_eq!(span.len(), 12);
        assert_eq!(span.months().first().unwrap().to_string(), "2025-10");
        let previous = span.previous();
        assert_eq!(
            (previous.from.to_string(), previous.to.to_string()),
            ("2024-10".to_string(), "2025-09".to_string())
        );
        assert_eq!(span.range().to.to_string(), "2026-09-30");
        assert!(MonthSpan::parse("2026-09", "2026-08").is_err());
        assert!(MonthSpan::parse("2023-09", "2026-09").is_err());
        assert_eq!(MonthSpan::parse("2023-10", "2026-09").unwrap().len(), 36);
    }

    #[test]
    fn months_totals_and_averages_leave_the_current_month_out() {
        use TransactionKind::{Expense, Income};
        let monthly = [
            ("2026-07".to_string(), Income, 500_000),
            ("2026-07".to_string(), Expense, 300_000),
            ("2026-08".to_string(), Income, 500_000),
            ("2026-08".to_string(), Expense, 400_001),
            // Mês atual, ainda no começo: fora da média.
            ("2026-09".to_string(), Expense, 50_000),
        ];
        let input = AnalyticsInput {
            monthly: &monthly,
            ..empty_input(&[])
        };
        let span = MonthSpan::parse("2026-07", "2026-09").unwrap();
        let analytics = build_analytics(span, &input, date("2026-09-05"));
        let nets: Vec<i64> = analytics.months.iter().map(|m| m.net).collect();
        assert_eq!(nets, vec![200_000, 99_999, -50_000]);
        let totals = analytics.totals;
        assert_eq!((totals.income, totals.expenses), (1_000_000, 750_001));
        assert_eq!(totals.net, 249_999);
        assert_eq!(totals.average_months, 2);
        assert_eq!(totals.average_income, 500_000);
        // 700.001 / 2, arredondado.
        assert_eq!(totals.average_expenses, 350_001);

        // Só o mês atual no período: a média é dele mesmo.
        let only_current = build_analytics(
            MonthSpan::parse("2026-09", "2026-09").unwrap(),
            &input,
            date("2026-09-05"),
        );
        assert_eq!(only_current.totals.average_months, 1);
        assert_eq!(only_current.totals.average_expenses, 50_000);

        // Meses antes do primeiro registro não entram na média...
        let longer = MonthSpan::parse("2026-04", "2026-09").unwrap();
        let before = build_analytics(longer, &input, date("2026-09-05")).totals;
        assert_eq!((before.average_months, before.average_income), (2, 500_000));
        // ...mas um mês sem nada depois de começar a registrar entra, zerado.
        let flows = [(1, date("2026-05-20"), 1_000)];
        let recorded = AnalyticsInput {
            flows: &flows,
            ..input
        };
        let totals = build_analytics(longer, &recorded, date("2026-09-05")).totals;
        assert_eq!((totals.average_months, totals.average_income), (4, 250_000));
    }

    #[test]
    fn categories_by_month_with_the_previous_period() {
        let category_months = [
            ("2026-08".to_string(), Some(1), 10_000),
            ("2026-09".to_string(), Some(1), 30_000),
            ("2026-09".to_string(), None, 5_000),
            ("2026-09".to_string(), Some(2), 60_000),
            // Fora do período: ignorado.
            ("2026-06".to_string(), Some(3), 99_000),
        ];
        let previous = [
            CategoryTotal {
                category_id: Some(1),
                total: 20_000,
            },
            CategoryTotal {
                category_id: Some(4),
                total: 7_000,
            },
        ];
        let input = AnalyticsInput {
            category_months: &category_months,
            previous_categories: &previous,
            ..empty_input(&[])
        };
        let span = MonthSpan::parse("2026-08", "2026-09").unwrap();
        let categories = build_analytics(span, &input, date("2026-09-30")).categories;
        let summary: Vec<_> = categories
            .iter()
            .map(|c| (c.category_id, c.total, c.previous_total, c.months.clone()))
            .collect();
        assert_eq!(
            summary,
            vec![
                (Some(2), 60_000, 0, vec![0, 60_000]),
                (Some(1), 40_000, 20_000, vec![10_000, 30_000]),
                (None, 5_000, 0, vec![0, 5_000]),
            ]
        );
    }

    fn movement(id: i64, kind: MovementKind, on: &str, amount: i64) -> Movement {
        Movement {
            id,
            asset_id: 1,
            kind,
            date: date(on),
            amount,
            quantity: None,
            transaction_id: None,
            notes: String::new(),
        }
    }

    #[test]
    fn net_worth_counts_invested_money_once() {
        let accounts = [
            account(1, AccountKind::Checking, 100_000),
            account(2, AccountKind::CreditCard, 0),
            account(3, AccountKind::Investment, 0),
        ];
        let flows = [
            // Salário em julho.
            (1, date("2026-07-05"), 500_000),
            // Fatura do cartão em agosto (paga, dívida no cartão)...
            (2, date("2026-08-10"), -80_000),
            // ...e a transferência de pagamento.
            (1, date("2026-08-10"), -80_000),
            (2, date("2026-08-10"), 80_000),
            // Aplicação de 200 mil em agosto: sai da conta corrente, entra na de investimentos.
            (1, date("2026-08-15"), -200_000),
            (3, date("2026-08-15"), 200_000),
            // Lançamento pago com data futura (fatura que vence em outubro).
            (2, date("2026-10-10"), -30_000),
        ];
        let asset = Asset {
            id: 1,
            account_id: 3,
            class: AssetClass::FixedIncome,
            name: "CDB".into(),
            ticker: None,
            maturity_date: None,
            notes: String::new(),
            created_at: String::new(),
            updated_at: String::new(),
        };
        let assets: Vec<AssetHistory> = vec![(
            asset,
            vec![movement(
                1,
                MovementKind::Contribution,
                "2026-08-15",
                200_000,
            )],
            vec![Valuation {
                asset_id: 1,
                date: date("2026-09-30"),
                value: 202_000,
            }],
        )];
        let input = AnalyticsInput {
            flows: &flows,
            assets: &assets,
            ..empty_input(&accounts)
        };
        let span = MonthSpan::parse("2026-06", "2026-10").unwrap();
        let months = build_analytics(span, &input, date("2026-09-30")).months;
        let points: Vec<Option<(i64, i64, i64)>> = months
            .iter()
            .map(|m| m.net_worth.map(|p| (p.accounts, p.investments, p.total)))
            .collect();
        assert_eq!(
            points,
            vec![
                // Antes do primeiro registro: desconhecido.
                None,
                Some((600_000, 0, 600_000)),
                // A aplicação muda de lugar, não de valor.
                Some((320_000, 200_000, 520_000)),
                // Valor informado em setembro: +2 mil de rendimento; a fatura de outubro ainda não conta.
                Some((320_000, 202_000, 522_000)),
                // Depois do mês atual: sem patrimônio.
                None,
            ]
        );
    }

    #[test]
    fn no_records_means_no_net_worth() {
        let accounts = [account(1, AccountKind::Checking, 100_000)];
        let span = MonthSpan::parse("2026-08", "2026-09").unwrap();
        let analytics = build_analytics(span, &empty_input(&accounts), date("2026-09-30"));
        assert!(analytics.months.iter().all(|m| m.net_worth.is_none()));
        assert!(analytics.categories.is_empty());
        assert_eq!(analytics.totals.average_expenses, 0);
    }
}
