//! Desempenho dos investimentos (Fase 6.2): resultado e rentabilidade de um
//! período, evolução mês a mês da carteira, proventos por mês e vencimentos da
//! renda fixa. Fonte da verdade; tudo parte dos valores INFORMADOS pelo usuário
//! (`value_on`), sem cotações nem rendimentos calculados.
//!
//! Rentabilidade pelo método de Dietz modificado: o resultado do período
//! dividido pelo valor do início mais as aplicações − resgates pesados pelo
//! tempo que ficaram investidos. Assim, aplicar no meio do período não conta
//! como ganho nem dilui o percentual.

use serde::Serialize;

use crate::domain::calendar::CalendarDate;
use crate::domain::finance::investments::{
    value_on, AssetClass, AssetHistory, Movement, MovementKind, Valuation, ValueStatus,
    STALE_AFTER_DAYS,
};
use crate::domain::finance::period::YearMonth;
use crate::error::{AppError, AppResult};

/// Meses mostrados na evolução (o atual e os anteriores).
pub const EVOLUTION_MONTHS: i64 = 24;

/// Período do desempenho (inclusivo).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Period {
    pub from: CalendarDate,
    pub to: CalendarDate,
}

impl Period {
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
        Ok(Self { from, to })
    }
}

/// Resultado de um ativo (ou da carteira) no período.
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodResult {
    /// Valor ao fim do dia anterior ao início.
    pub start_value: i64,
    pub end_value: i64,
    pub contributed: i64,
    pub withdrawn: i64,
    pub income: i64,
    /// Valor final − inicial − aplicações + resgates + proventos.
    pub gain: i64,
    /// Rentabilidade (Dietz modificado); `None` sem capital no período.
    pub rate: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetPerformance {
    pub asset_id: i64,
    pub name: String,
    pub class: AssetClass,
    #[serde(flatten)]
    pub result: PeriodResult,
    /// Valores informados (há até 35 dias) no início e no fim; senão o
    /// resultado é aproximado (considera só o que foi aplicado).
    pub exact: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceTotals {
    #[serde(flatten)]
    pub result: PeriodResult,
    /// Ativos cujo resultado no período é aproximado.
    pub approximate_assets: u32,
}

/// Carteira ao fim de um mês (no mês atual, hoje).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioMonth {
    /// `aaaa-mm`.
    pub month: String,
    pub value: i64,
    /// Aplicações − resgates acumulados até o fim do mês.
    pub invested: i64,
    /// Proventos recebidos no mês.
    pub income: i64,
}

/// Título de renda fixa com vencimento, ainda com valor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Maturity {
    pub asset_id: i64,
    pub name: String,
    pub date: String,
    pub value: i64,
    /// Dias até o vencimento (negativo = já venceu e não foi resgatado).
    pub days: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvestmentsPerformance {
    pub from: String,
    pub to: String,
    pub today: String,
    pub totals: PerformanceTotals,
    /// Ativos com valor ou movimentação no período, maior valor final primeiro.
    pub assets: Vec<AssetPerformance>,
    /// Do primeiro mês com movimentação (até 24 meses atrás) ao mês atual.
    pub months: Vec<PortfolioMonth>,
    /// Vencimentos em ordem de data (os já vencidos primeiro).
    pub maturities: Vec<Maturity>,
}

/// Resultado e peso (denominador de Dietz) de um ativo no período.
struct AssetPeriod {
    result: PeriodResult,
    capital: f64,
    exact: bool,
}

fn asset_period(movements: &[Movement], valuations: &[Valuation], period: Period) -> AssetPeriod {
    let start = period.from.add_days(-1);
    let end = period.to;
    let start_at = value_on(movements, valuations, Some(start));
    let end_at = value_on(movements, valuations, Some(end));
    let span = start.days_until(end) as f64;

    let mut result = PeriodResult {
        start_value: start_at.value,
        end_value: end_at.value,
        ..PeriodResult::default()
    };
    let mut capital = start_at.value as f64;
    for movement in movements
        .iter()
        .filter(|movement| movement.date > start && movement.date <= end)
    {
        // Peso = fração do período em que o dinheiro ficou investido.
        let weight = movement.date.days_until(end) as f64 / span;
        match movement.kind {
            MovementKind::Contribution => {
                result.contributed += movement.amount;
                capital += weight * movement.amount as f64;
            }
            MovementKind::Withdrawal => {
                result.withdrawn += movement.amount;
                capital -= weight * movement.amount as f64;
            }
            MovementKind::Income => result.income += movement.amount,
        }
    }
    result.gain = result.end_value - result.start_value - result.contributed
        + result.withdrawn
        + result.income;
    result.rate = rate(result.gain, capital);

    let held_before = movements.iter().any(|movement| movement.date <= start);
    let reliable = |at: crate::domain::finance::investments::ValueAt, on: CalendarDate| {
        at.value == 0
            || (at.status == ValueStatus::Informed
                && at
                    .valued_on
                    .is_some_and(|date| date.days_until(on) <= STALE_AFTER_DAYS))
    };
    let exact = (!held_before || reliable(start_at, start)) && reliable(end_at, end);
    AssetPeriod {
        result,
        capital,
        exact,
    }
}

/// Percentual só com capital de ao menos um centavo.
fn rate(gain: i64, capital: f64) -> Option<f64> {
    (capital >= 1.0).then(|| gain as f64 / capital)
}

/// Desempenho da carteira no período, evolução mensal e vencimentos.
pub fn build_performance(
    assets: &[AssetHistory],
    period: Period,
    today: CalendarDate,
) -> InvestmentsPerformance {
    let mut totals = PeriodResult::default();
    let mut capital = 0.0;
    let mut approximate_assets = 0;
    let mut rows = Vec::new();
    for (asset, movements, valuations) in assets {
        let current = asset_period(movements, valuations, period);
        let result = current.result;
        let active = result.start_value > 0
            || result.end_value > 0
            || result.contributed + result.withdrawn + result.income > 0;
        if !active {
            continue;
        }
        totals.start_value += result.start_value;
        totals.end_value += result.end_value;
        totals.contributed += result.contributed;
        totals.withdrawn += result.withdrawn;
        totals.income += result.income;
        totals.gain += result.gain;
        capital += current.capital;
        if !current.exact {
            approximate_assets += 1;
        }
        rows.push(AssetPerformance {
            asset_id: asset.id,
            name: asset.name.clone(),
            class: asset.class,
            result,
            exact: current.exact,
        });
    }
    totals.rate = rate(totals.gain, capital);
    rows.sort_by(|a, b| {
        b.result
            .end_value
            .cmp(&a.result.end_value)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    InvestmentsPerformance {
        from: period.from.to_string(),
        to: period.to.to_string(),
        today: today.to_string(),
        totals: PerformanceTotals {
            result: totals,
            approximate_assets,
        },
        assets: rows,
        months: months(assets, today),
        maturities: maturities(assets, today),
    }
}

/// Carteira ao fim de cada mês, do primeiro com movimentação ou valor
/// informado (até [`EVOLUTION_MONTHS`] atrás) até o atual.
fn months(assets: &[AssetHistory], today: CalendarDate) -> Vec<PortfolioMonth> {
    let first = assets
        .iter()
        .flat_map(|(_, movements, valuations)| {
            movements
                .iter()
                .map(|movement| movement.date)
                .chain(valuations.iter().map(|valuation| valuation.date))
        })
        .min();
    let Some(first) = first else {
        return Vec::new();
    };
    let current = YearMonth::of(today);
    let oldest = current.add_months(1 - EVOLUTION_MONTHS);
    let mut month = YearMonth::of(first).max(oldest);
    if month > current {
        return Vec::new();
    }

    let mut points = Vec::new();
    while month <= current {
        let end = month.last_day().min(today);
        let begin = month.first_day();
        let mut point = PortfolioMonth {
            month: month.to_string(),
            value: 0,
            invested: 0,
            income: 0,
        };
        for (_, movements, valuations) in assets {
            point.value += value_on(movements, valuations, Some(end)).value;
            for movement in movements.iter().filter(|movement| movement.date <= end) {
                match movement.kind {
                    MovementKind::Contribution => point.invested += movement.amount,
                    MovementKind::Withdrawal => point.invested -= movement.amount,
                    MovementKind::Income if movement.date >= begin => {
                        point.income += movement.amount;
                    }
                    MovementKind::Income => {}
                }
            }
        }
        points.push(point);
        month = month.add_months(1);
    }
    points
}

/// Renda fixa com vencimento e ainda com valor, pela data.
fn maturities(assets: &[AssetHistory], today: CalendarDate) -> Vec<Maturity> {
    let mut list: Vec<Maturity> = assets
        .iter()
        .filter_map(|(asset, movements, valuations)| {
            let date = asset.maturity_date?;
            let value = value_on(movements, valuations, None).value;
            (asset.class == AssetClass::FixedIncome && value > 0).then(|| Maturity {
                asset_id: asset.id,
                name: asset.name.clone(),
                date: date.to_string(),
                value,
                days: today.days_until(date),
            })
        })
        .collect();
    list.sort_by(|a, b| a.date.cmp(&b.date).then(a.asset_id.cmp(&b.asset_id)));
    list
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::finance::investments::Asset;

    fn date(value: &str) -> CalendarDate {
        CalendarDate::parse(value).unwrap()
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

    fn valuation(on: &str, value: i64) -> Valuation {
        Valuation {
            asset_id: 1,
            date: date(on),
            value,
        }
    }

    fn asset(id: i64, name: &str, maturity: Option<&str>) -> Asset {
        Asset {
            id,
            account_id: 1,
            class: AssetClass::FixedIncome,
            name: name.into(),
            ticker: None,
            maturity_date: maturity.map(date),
            notes: String::new(),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn september() -> Period {
        Period::parse("2026-09-01", "2026-09-30").unwrap()
    }

    #[test]
    fn gain_ignores_money_put_in_during_the_period() {
        let movements = [
            movement(1, MovementKind::Contribution, "2026-06-01", 100_000),
            // Aplicação no meio do mês: não é ganho.
            movement(2, MovementKind::Contribution, "2026-09-16", 50_000),
            movement(3, MovementKind::Income, "2026-09-20", 500),
        ];
        let valuations = [
            valuation("2026-08-31", 101_000),
            valuation("2026-09-30", 152_500),
        ];
        let period = asset_period(&movements, &valuations, september());
        let result = period.result;
        assert_eq!((result.start_value, result.end_value), (101_000, 152_500));
        assert_eq!((result.contributed, result.income), (50_000, 500));
        assert_eq!(result.gain, 152_500 - 101_000 - 50_000 + 500);
        // Dietz: 101.000 + 50.000 × 14/30 dias investidos.
        let capital = 101_000.0 + 50_000.0 * 14.0 / 30.0;
        assert!((result.rate.unwrap() - 2_000.0 / capital).abs() < 1e-12);
        assert!(period.exact);
    }

    #[test]
    fn missing_or_old_values_make_the_result_approximate() {
        let movements = [movement(
            1,
            MovementKind::Contribution,
            "2026-06-01",
            100_000,
        )];
        // Sem valor informado: só o aplicado, resultado zero e aproximado.
        let never = asset_period(&movements, &[], september());
        assert_eq!((never.result.gain, never.exact), (0, false));
        // Valor do fim antigo demais (mais de 35 dias antes do fim).
        let old = asset_period(&movements, &[valuation("2026-08-20", 100_800)], september());
        assert!(!old.exact);
        assert_eq!(old.result.gain, 0);
        // Começou no período: o início (nada investido) é exato.
        let fresh = [movement(
            1,
            MovementKind::Contribution,
            "2026-09-10",
            10_000,
        )];
        let started = asset_period(&fresh, &[valuation("2026-09-29", 10_050)], september());
        assert!(started.exact);
        assert_eq!(started.result.gain, 50);
    }

    #[test]
    fn full_withdrawal_in_the_period() {
        let movements = [
            movement(1, MovementKind::Contribution, "2026-01-10", 100_000),
            movement(2, MovementKind::Withdrawal, "2026-09-15", 108_000),
        ];
        let valuations = [valuation("2026-08-31", 107_500), valuation("2026-09-15", 0)];
        let period = asset_period(&movements, &valuations, september());
        assert_eq!(period.result.end_value, 0);
        assert_eq!(period.result.gain, 500);
        assert!(period.exact);
        // Capital: 107.500 − 108.000 × 15/30.
        let capital = 107_500.0 - 108_000.0 * 15.0 / 30.0;
        assert!((period.result.rate.unwrap() - 500.0 / capital).abs() < 1e-12);
    }

    #[test]
    fn builds_totals_months_and_maturities() {
        let cdb = asset(1, "CDB", Some("2026-12-15"));
        let old = asset(2, "LCI antiga", Some("2026-09-01"));
        let gone = asset(3, "Resgatado", Some("2026-07-01"));
        let assets: Vec<AssetHistory> = vec![
            (
                cdb,
                vec![
                    movement(1, MovementKind::Contribution, "2026-07-10", 100_000),
                    movement(2, MovementKind::Income, "2026-08-05", 300),
                ],
                vec![
                    valuation("2026-08-31", 101_000),
                    valuation("2026-09-30", 102_000),
                ],
            ),
            (
                old,
                vec![movement(
                    3,
                    MovementKind::Contribution,
                    "2026-08-01",
                    20_000,
                )],
                vec![],
            ),
            (
                gone,
                vec![
                    movement(4, MovementKind::Contribution, "2026-01-01", 5_000),
                    movement(5, MovementKind::Withdrawal, "2026-02-01", 5_000),
                ],
                vec![],
            ),
        ];
        let performance = build_performance(&assets, september(), date("2026-09-30"));
        let totals = &performance.totals;
        assert_eq!(totals.result.start_value, 121_000);
        assert_eq!(totals.result.end_value, 122_000);
        assert_eq!(totals.result.gain, 1_000);
        // A LCI sem valor informado deixa o total aproximado.
        assert_eq!(totals.approximate_assets, 1);
        // O resgatado em fevereiro não aparece em setembro.
        let names: Vec<_> = performance.assets.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(names, vec!["CDB", "LCI antiga"]);

        // Evolução de janeiro (primeira movimentação) a setembro.
        assert_eq!(performance.months.len(), 9);
        assert_eq!(performance.months[0].month, "2026-01");
        assert_eq!(performance.months[0].invested, 5_000);
        let august = &performance.months[7];
        assert_eq!(
            (august.value, august.invested, august.income),
            (121_000, 120_000, 300)
        );

        // Vencimentos: o já vencido (e não resgatado) primeiro; o resgatado some.
        assert_eq!(
            performance
                .maturities
                .iter()
                .map(|m| (m.name.as_str(), m.days))
                .collect::<Vec<_>>(),
            vec![("LCI antiga", -29), ("CDB", 76)]
        );
    }

    #[test]
    fn evolution_is_limited_and_empty_without_data() {
        let long = vec![(
            asset(1, "CDB", None),
            vec![movement(1, MovementKind::Contribution, "2020-01-01", 1_000)],
            vec![],
        )];
        let performance = build_performance(&long, september(), date("2026-09-30"));
        assert_eq!(performance.months.len(), EVOLUTION_MONTHS as usize);
        assert_eq!(performance.months[0].month, "2024-10");
        assert!(build_performance(&[], september(), date("2026-09-30"))
            .months
            .is_empty());
    }

    #[test]
    fn validates_the_period() {
        assert!(Period::parse("2026-09-30", "2026-09-01").is_err());
        assert!(Period::parse("2026-09-31", "2026-10-01").is_err());
        assert_eq!(
            Period::parse("2000-01-01", "2026-09-30").unwrap().to,
            date("2026-09-30")
        );
    }
}
