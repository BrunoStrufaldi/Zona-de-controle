//! Investimentos (Fase 6.1): ativos, movimentações, valores informados e a
//! carteira. Fonte da verdade da posição de cada ativo e do patrimônio.
//!
//! O valor atual é sempre INFORMADO pelo usuário (copiado do app do banco): o
//! app não baixa cotações nem calcula rendimentos. Depois do último valor
//! informado, só as aplicações e os resgates entram na conta, e a tela avisa
//! que o valor está desatualizado.
//!
//! As aplicações e os resgates movem o dinheiro da conta de investimentos do
//! ativo. Por isso o patrimônio soma a carteira e só o que sobra nessa conta
//! (saldo − aplicações + resgates), sem contar o mesmo dinheiro duas vezes.

use serde::{Deserialize, Serialize};

use crate::domain::calendar::CalendarDate;
use crate::domain::finance::accounts::{AccountKind, FinanceAccount};
use crate::domain::finance::MAX_AMOUNT_CENTS;
use crate::error::{AppError, AppResult};

pub const MAX_ASSETS: usize = 200;
pub const MAX_NAME_CHARS: usize = 60;
pub const MAX_TICKER_CHARS: usize = 20;
pub const MAX_ASSET_NOTES_CHARS: usize = 2_000;
pub const MAX_MOVEMENT_NOTES_CHARS: usize = 500;
/// Quantidades são guardadas em 1e-8 unidade (cripto e Tesouro têm frações).
pub const QUANTITY_SCALE: i64 = 100_000_000;
/// Até 10 bilhões de unidades.
pub const MAX_QUANTITY: i64 = 10_000_000_000 * QUANTITY_SCALE;
/// Valor informado há mais tempo que isso pede atualização.
pub const STALE_AFTER_DAYS: i64 = 35;
/// Transferências sem ativo mostradas na tela (as mais recentes).
pub const MAX_UNLINKED: usize = 50;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetClass {
    /// CDB, Tesouro Direto, LCI/LCA, debêntures…
    FixedIncome,
    Stocks,
    /// Fundos imobiliários (FIIs).
    Reits,
    Etfs,
    Crypto,
    Other,
}

impl AssetClass {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::FixedIncome => "fixed_income",
            Self::Stocks => "stocks",
            Self::Reits => "reits",
            Self::Etfs => "etfs",
            Self::Crypto => "crypto",
            Self::Other => "other",
        }
    }

    pub fn parse(value: &str) -> AppResult<Self> {
        match value {
            "fixed_income" => Ok(Self::FixedIncome),
            "stocks" => Ok(Self::Stocks),
            "reits" => Ok(Self::Reits),
            "etfs" => Ok(Self::Etfs),
            "crypto" => Ok(Self::Crypto),
            "other" => Ok(Self::Other),
            other => Err(AppError::Validation(format!(
                "classe de ativo inválida: {other}"
            ))),
        }
    }
}

/// Aplicação (compra), resgate (venda) ou provento (dividendos, juros…).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MovementKind {
    Contribution,
    Withdrawal,
    Income,
}

impl MovementKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Contribution => "contribution",
            Self::Withdrawal => "withdrawal",
            Self::Income => "income",
        }
    }

    pub fn parse(value: &str) -> AppResult<Self> {
        match value {
            "contribution" => Ok(Self::Contribution),
            "withdrawal" => Ok(Self::Withdrawal),
            "income" => Ok(Self::Income),
            other => Err(AppError::Validation(format!(
                "tipo de movimentação inválido: {other}"
            ))),
        }
    }
}

// ---------------------------------------------------------------- Entradas

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetInput {
    /// Conta do tipo Investimentos onde o ativo fica (a instituição).
    pub account_id: i64,
    pub class: AssetClass,
    pub name: String,
    #[serde(default)]
    pub ticker: Option<String>,
    /// Só renda fixa (`aaaa-mm-dd`).
    #[serde(default)]
    pub maturity_date: Option<String>,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidAsset {
    pub account_id: i64,
    pub class: AssetClass,
    pub name: String,
    pub ticker: Option<String>,
    pub maturity_date: Option<CalendarDate>,
    pub notes: String,
}

impl AssetInput {
    pub fn validate(self) -> AppResult<ValidAsset> {
        let name = self.name.split_whitespace().collect::<Vec<_>>().join(" ");
        if name.is_empty() {
            return Err(AppError::Validation("o nome do ativo é obrigatório".into()));
        }
        if name.chars().count() > MAX_NAME_CHARS {
            return Err(AppError::Validation(format!(
                "o nome do ativo pode ter no máximo {MAX_NAME_CHARS} caracteres"
            )));
        }
        let ticker = match self.ticker.as_deref().map(str::trim) {
            None | Some("") => None,
            Some(ticker) => {
                if ticker.chars().count() > MAX_TICKER_CHARS || ticker.contains(char::is_whitespace)
                {
                    return Err(AppError::Validation(format!(
                        "o código precisa ter até {MAX_TICKER_CHARS} caracteres, sem espaços"
                    )));
                }
                Some(ticker.to_uppercase())
            }
        };
        // Vencimento só faz sentido na renda fixa; nas outras classes é descartado.
        let maturity_date = match (self.class, self.maturity_date.as_deref().map(str::trim)) {
            (AssetClass::FixedIncome, Some(value)) if !value.is_empty() => {
                Some(CalendarDate::parse(value).ok_or_else(|| {
                    AppError::Validation(format!("data de vencimento inválida: {value}"))
                })?)
            }
            _ => None,
        };
        let notes = self.notes.trim().to_string();
        if notes.chars().count() > MAX_ASSET_NOTES_CHARS {
            return Err(AppError::Validation(format!(
                "a observação pode ter no máximo {MAX_ASSET_NOTES_CHARS} caracteres"
            )));
        }
        Ok(ValidAsset {
            account_id: self.account_id,
            class: self.class,
            name,
            ticker,
            maturity_date,
            notes,
        })
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MovementInput {
    pub kind: MovementKind,
    pub date: String,
    pub amount: i64,
    /// Em 1e-8 unidade (opcional; ignorada nos proventos).
    #[serde(default)]
    pub quantity: Option<i64>,
    #[serde(default)]
    pub notes: String,
    /// Só na criação: conta de onde sai a aplicação (ou para onde vai o
    /// resgate/provento). Com ela, o lançamento é criado e vinculado.
    #[serde(default)]
    pub account_id: Option<i64>,
    /// Só em resgates: resgate total (o valor do ativo passa a ser zero).
    #[serde(default)]
    pub closes_position: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidMovement {
    pub kind: MovementKind,
    pub date: CalendarDate,
    pub amount: i64,
    pub quantity: Option<i64>,
    pub notes: String,
    pub account_id: Option<i64>,
    pub closes_position: bool,
}

impl MovementInput {
    pub fn validate(self) -> AppResult<ValidMovement> {
        check_amount(self.amount, "o valor")?;
        if self.amount == 0 {
            return Err(AppError::Validation(
                "o valor precisa ser maior que zero".into(),
            ));
        }
        let date = CalendarDate::parse(self.date.trim())
            .ok_or_else(|| AppError::Validation(format!("data inválida: {}", self.date)))?;
        let quantity = match self.kind {
            MovementKind::Income => None,
            _ => self.quantity,
        };
        if let Some(quantity) = quantity {
            if !(1..=MAX_QUANTITY).contains(&quantity) {
                return Err(AppError::Validation(
                    "a quantidade precisa ser maior que zero e dentro do limite aceito".into(),
                ));
            }
        }
        let notes = self.notes.trim().to_string();
        if notes.chars().count() > MAX_MOVEMENT_NOTES_CHARS {
            return Err(AppError::Validation(format!(
                "a observação pode ter no máximo {MAX_MOVEMENT_NOTES_CHARS} caracteres"
            )));
        }
        Ok(ValidMovement {
            kind: self.kind,
            date,
            amount: self.amount,
            quantity,
            notes,
            account_id: self.account_id,
            closes_position: self.closes_position && self.kind == MovementKind::Withdrawal,
        })
    }
}

/// Valor total de um ativo informado numa data.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValuationInput {
    pub asset_id: i64,
    pub date: String,
    pub value: i64,
}

impl ValuationInput {
    pub fn validate(self) -> AppResult<Valuation> {
        check_amount(self.value, "o valor informado")?;
        let date = CalendarDate::parse(self.date.trim())
            .ok_or_else(|| AppError::Validation(format!("data inválida: {}", self.date)))?;
        Ok(Valuation {
            asset_id: self.asset_id,
            date,
            value: self.value,
        })
    }
}

fn check_amount(value: i64, what: &str) -> AppResult<()> {
    if value < 0 {
        return Err(AppError::Validation(format!(
            "{what} não pode ser negativo"
        )));
    }
    if value > MAX_AMOUNT_CENTS {
        return Err(AppError::Validation(format!(
            "{what} está acima do limite aceito"
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------- Dados

#[derive(Debug, Clone, PartialEq)]
pub struct Asset {
    pub id: i64,
    pub account_id: i64,
    pub class: AssetClass,
    pub name: String,
    pub ticker: Option<String>,
    pub maturity_date: Option<CalendarDate>,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Movimentação como exposta ao frontend.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Movement {
    pub id: i64,
    pub asset_id: i64,
    pub kind: MovementKind,
    #[serde(serialize_with = "serialize_date")]
    pub date: CalendarDate,
    /// Centavos, sempre positivo.
    pub amount: i64,
    /// Em 1e-8 unidade.
    pub quantity: Option<i64>,
    /// Lançamento que moveu o dinheiro (valor e data vêm dele).
    pub transaction_id: Option<i64>,
    pub notes: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Valuation {
    pub asset_id: i64,
    #[serde(serialize_with = "serialize_date")]
    pub date: CalendarDate,
    pub value: i64,
}

fn serialize_date<S: serde::Serializer>(
    date: &CalendarDate,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    serializer.collect_str(date)
}

// ---------------------------------------------------------------- Posição

/// De onde vem o valor atual.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ValueStatus {
    /// Igual ao último valor informado.
    Informed,
    /// Último valor informado + aplicações − resgates feitos depois dele.
    Adjusted,
    /// Nunca informado: aplicações − resgates.
    NotInformed,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    /// Valor atual (centavos; nunca negativo).
    pub value: i64,
    pub value_status: ValueStatus,
    /// Data do último valor informado.
    pub valued_on: Option<String>,
    pub contributed: i64,
    pub withdrawn: i64,
    /// Proventos recebidos (não fazem parte do valor).
    pub income: i64,
    /// Aplicado líquido: aplicações − resgates (negativo se já resgatou mais do que aplicou).
    pub invested: i64,
    /// Resultado total: valor + resgates + proventos − aplicações.
    pub gain: i64,
    /// Resultado sobre o total aplicado (`None` sem aplicações).
    pub gain_rate: Option<f64>,
    /// Quantidade atual (1e-8), quando todas as aplicações e resgates têm quantidade.
    pub quantity: Option<i64>,
    /// Preço médio por unidade (centavos, custo médio), com quantidade > 0.
    pub average_price: Option<i64>,
    /// Pede atualização do valor (nunca informado, desatualizado ou antigo).
    pub stale: bool,
    /// Tudo resgatado (valor zero depois de movimentações).
    pub closed: bool,
    pub movement_count: u32,
}

/// Valor de um ativo ao fim de um dia.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ValueAt {
    pub value: i64,
    pub status: ValueStatus,
    /// Data do último valor informado até o dia.
    pub valued_on: Option<CalendarDate>,
}

/// Valor ao fim do dia `on` (`None` = com todas as movimentações): o último
/// valor informado até o dia + aplicações − resgates feitos depois dele; sem
/// nenhum, aplicações − resgates. Quem vendeu todas as cotas fica com zero.
pub fn value_on(
    movements: &[Movement],
    valuations: &[Valuation],
    on: Option<CalendarDate>,
) -> ValueAt {
    let within = |date: CalendarDate| on.map_or(true, |limit| date <= limit);
    let mut ordered: Vec<&Movement> = movements
        .iter()
        .filter(|movement| within(movement.date))
        .collect();
    ordered.sort_by_key(|movement| (movement.date, movement.id));
    let last = valuations
        .iter()
        .filter(|valuation| within(valuation.date))
        .max_by_key(|valuation| valuation.date);

    let base = last.map_or(0, |valuation| valuation.value);
    let mut flows = 0;
    let mut moved = false;
    for movement in &ordered {
        if last.is_some_and(|valuation| movement.date <= valuation.date) {
            continue;
        }
        match movement.kind {
            MovementKind::Contribution => flows += movement.amount,
            MovementKind::Withdrawal => flows -= movement.amount,
            MovementKind::Income => continue,
        }
        moved = true;
    }
    let status = match (last, moved) {
        (None, _) => ValueStatus::NotInformed,
        (Some(_), true) => ValueStatus::Adjusted,
        (Some(_), false) => ValueStatus::Informed,
    };
    let sold_everything = holdings(&ordered).map(|(quantity, _)| quantity) == Some(0);
    ValueAt {
        value: if sold_everything {
            0
        } else {
            (base + flows).max(0)
        },
        status,
        valued_on: last.map(|valuation| valuation.date),
    }
}

/// Posição do ativo a partir das movimentações e dos valores informados.
pub fn position(movements: &[Movement], valuations: &[Valuation], today: CalendarDate) -> Position {
    let mut ordered: Vec<&Movement> = movements.iter().collect();
    ordered.sort_by_key(|movement| (movement.date, movement.id));
    let sum = |kind: MovementKind| -> i64 {
        ordered
            .iter()
            .filter(|movement| movement.kind == kind)
            .map(|movement| movement.amount)
            .sum()
    };
    let (contributed, withdrawn, income) = (
        sum(MovementKind::Contribution),
        sum(MovementKind::Withdrawal),
        sum(MovementKind::Income),
    );
    let holdings = holdings(&ordered);
    let current = value_on(movements, valuations, None);
    let (value, value_status) = (current.value, current.status);
    let last = current.valued_on;

    let movement_count = ordered.len() as u32;
    let closed = value == 0 && movement_count > 0;
    let old = last.is_some_and(|date| date.days_until(today) > STALE_AFTER_DAYS);
    let stale = !closed
        && movement_count + valuations.len() as u32 > 0
        && (value_status != ValueStatus::Informed || old);
    let gain = value + withdrawn + income - contributed;

    Position {
        value,
        value_status,
        valued_on: last.map(|date| date.to_string()),
        contributed,
        withdrawn,
        income,
        invested: contributed - withdrawn,
        gain,
        gain_rate: (contributed > 0).then(|| gain as f64 / contributed as f64),
        quantity: holdings.map(|(quantity, _)| quantity),
        average_price: holdings.and_then(|(quantity, cost)| {
            (quantity > 0).then(|| {
                let price = (i128::from(cost) * i128::from(QUANTITY_SCALE)
                    + i128::from(quantity) / 2)
                    / i128::from(quantity);
                i64::try_from(price).unwrap_or(i64::MAX)
            })
        }),
        stale,
        closed,
        movement_count,
    }
}

/// Quantidade e custo (centavos) restantes pelo custo médio, quando todas as
/// aplicações e resgates têm quantidade. Vender reduz o custo na proporção das
/// cotas vendidas.
fn holdings(ordered: &[&Movement]) -> Option<(i64, i64)> {
    let trades: Vec<&&Movement> = ordered
        .iter()
        .filter(|movement| movement.kind != MovementKind::Income)
        .collect();
    if trades.is_empty() || trades.iter().any(|movement| movement.quantity.is_none()) {
        return None;
    }
    let (mut quantity, mut cost) = (0_i64, 0_i64);
    for movement in trades {
        let traded = movement.quantity.unwrap_or(0);
        match movement.kind {
            MovementKind::Contribution => {
                quantity += traded;
                cost += movement.amount;
            }
            MovementKind::Withdrawal => {
                if traded >= quantity {
                    quantity = 0;
                    cost = 0;
                } else {
                    let removed = i128::from(cost) * i128::from(traded) / i128::from(quantity);
                    cost -= i64::try_from(removed).unwrap_or(cost);
                    quantity -= traded;
                }
            }
            MovementKind::Income => {}
        }
    }
    Some((quantity, cost))
}

// ---------------------------------------------------------------- Carteira

/// Ativo com as movimentações e os valores informados, como lidos do banco.
pub type AssetHistory = (Asset, Vec<Movement>, Vec<Valuation>);

/// Ativo com a posição, como exposto ao frontend.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetView {
    pub id: i64,
    pub account_id: i64,
    pub class: AssetClass,
    pub name: String,
    pub ticker: Option<String>,
    pub maturity_date: Option<String>,
    pub notes: String,
    pub position: Position,
    pub created_at: String,
    pub updated_at: String,
}

impl AssetView {
    pub fn new(asset: Asset, position: Position) -> Self {
        Self {
            id: asset.id,
            account_id: asset.account_id,
            class: asset.class,
            name: asset.name,
            ticker: asset.ticker,
            maturity_date: asset.maturity_date.map(|date| date.to_string()),
            notes: asset.notes,
            position,
            created_at: asset.created_at,
            updated_at: asset.updated_at,
        }
    }
}

/// Ativo com o histórico completo (tela de detalhes).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetDetail {
    pub asset: AssetView,
    /// Mais recentes primeiro.
    pub movements: Vec<Movement>,
    /// Mais recentes primeiro.
    pub valuations: Vec<Valuation>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassShare {
    pub class: AssetClass,
    pub value: i64,
    /// Fração da carteira (0–1).
    pub share: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioTotals {
    pub value: i64,
    pub contributed: i64,
    pub withdrawn: i64,
    pub income: i64,
    pub invested: i64,
    pub gain: i64,
}

/// O que sobra numa conta de investimentos fora da carteira.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvestmentAccountCash {
    pub account_id: i64,
    pub balance: i64,
    /// Aplicações − resgates dos ativos da conta.
    pub net_contributions: i64,
    /// Saldo − aplicações + resgates. Negativo = aplicações registradas sem o
    /// dinheiro ter entrado na conta (falta a transferência ou o saldo inicial).
    pub cash: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetWorth {
    /// Saldos das outras contas (cartões entram negativos).
    pub accounts: i64,
    /// Dinheiro parado nas contas de investimentos, fora da carteira.
    pub investment_cash: i64,
    pub portfolio: i64,
    pub total: i64,
}

/// Transferência para/de uma conta de investimentos ainda sem ativo.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlinkedTransfer {
    pub transaction_id: i64,
    /// Aplicação (entra na conta de investimentos) ou resgate (sai dela).
    pub kind: MovementKind,
    pub investment_account_id: i64,
    /// A outra conta da transferência.
    pub other_account_id: i64,
    pub description: String,
    pub amount: i64,
    pub date: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvestmentsOverview {
    pub today: String,
    /// Maior valor primeiro; encerrados no fim.
    pub assets: Vec<AssetView>,
    pub totals: PortfolioTotals,
    pub by_class: Vec<ClassShare>,
    pub accounts: Vec<InvestmentAccountCash>,
    pub net_worth: NetWorth,
    pub stale_count: u32,
    pub unlinked: Vec<UnlinkedTransfer>,
}

/// Monta a carteira: posição de cada ativo, totais, distribuição por classe,
/// o dinheiro fora da carteira nas contas de investimentos e o patrimônio.
pub fn build_overview(
    assets: Vec<AssetHistory>,
    accounts: &[FinanceAccount],
    unlinked: Vec<UnlinkedTransfer>,
    today: CalendarDate,
) -> InvestmentsOverview {
    let mut totals = PortfolioTotals::default();
    let mut views = Vec::with_capacity(assets.len());
    for (asset, movements, valuations) in assets {
        let position = position(&movements, &valuations, today);
        totals.value += position.value;
        totals.contributed += position.contributed;
        totals.withdrawn += position.withdrawn;
        totals.income += position.income;
        views.push(AssetView::new(asset, position));
    }
    totals.invested = totals.contributed - totals.withdrawn;
    totals.gain = totals.value + totals.withdrawn + totals.income - totals.contributed;
    views.sort_by(|a, b| {
        (
            a.position.closed,
            std::cmp::Reverse(a.position.value),
            a.name.to_lowercase(),
            a.id,
        )
            .cmp(&(
                b.position.closed,
                std::cmp::Reverse(b.position.value),
                b.name.to_lowercase(),
                b.id,
            ))
    });

    let mut by_class: Vec<ClassShare> = Vec::new();
    for view in &views {
        if view.position.value == 0 {
            continue;
        }
        match by_class.iter_mut().find(|share| share.class == view.class) {
            Some(share) => share.value += view.position.value,
            None => by_class.push(ClassShare {
                class: view.class,
                value: view.position.value,
                share: 0.0,
            }),
        }
    }
    for share in &mut by_class {
        share.share = share.value as f64 / totals.value as f64;
    }
    by_class.sort_by(|a, b| b.value.cmp(&a.value).then(a.class.cmp(&b.class)));

    // Conta que guarda ativos conta como de investimentos mesmo se o tipo mudar.
    let holds_assets = |id: i64| views.iter().any(|view| view.account_id == id);
    let mut cash_accounts = Vec::new();
    let mut net_worth = NetWorth {
        accounts: 0,
        investment_cash: 0,
        portfolio: totals.value,
        total: 0,
    };
    for account in accounts {
        if account.kind != AccountKind::Investment && !holds_assets(account.id) {
            net_worth.accounts += account.balance;
            continue;
        }
        let net_contributions = views
            .iter()
            .filter(|view| view.account_id == account.id)
            .map(|view| view.position.invested)
            .sum::<i64>();
        let cash = account.balance - net_contributions;
        net_worth.investment_cash += cash;
        cash_accounts.push(InvestmentAccountCash {
            account_id: account.id,
            balance: account.balance,
            net_contributions,
            cash,
        });
    }
    net_worth.total = net_worth.accounts + net_worth.investment_cash + net_worth.portfolio;

    InvestmentsOverview {
        today: today.to_string(),
        stale_count: views.iter().filter(|view| view.position.stale).count() as u32,
        assets: views,
        totals,
        by_class,
        accounts: cash_accounts,
        net_worth,
        unlinked,
    }
}

/// Que movimentação um lançamento representa para um ativo guardado em
/// `asset_account`: transferência que entra na conta = aplicação; que sai =
/// resgate; entrada (em qualquer conta) = provento. `None` se não servir.
pub fn movement_kind_for(
    kind: crate::domain::finance::TransactionKind,
    account_id: i64,
    transfer_account_id: Option<i64>,
    asset_account: i64,
) -> Option<MovementKind> {
    use crate::domain::finance::TransactionKind;
    match kind {
        TransactionKind::Transfer if transfer_account_id == Some(asset_account) => {
            Some(MovementKind::Contribution)
        }
        TransactionKind::Transfer if account_id == asset_account => Some(MovementKind::Withdrawal),
        TransactionKind::Income => Some(MovementKind::Income),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::finance::TransactionKind;
    use crate::domain::task_categories::CategoryColor;

    fn date(value: &str) -> CalendarDate {
        CalendarDate::parse(value).unwrap()
    }

    fn movement(
        id: i64,
        kind: MovementKind,
        on: &str,
        amount: i64,
        quantity: Option<i64>,
    ) -> Movement {
        Movement {
            id,
            asset_id: 1,
            kind,
            date: date(on),
            amount,
            quantity,
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

    fn units(count: i64) -> i64 {
        count * QUANTITY_SCALE
    }

    const TODAY: &str = "2026-09-30";

    fn asset(id: i64, account_id: i64, class: AssetClass, name: &str) -> Asset {
        Asset {
            id,
            account_id,
            class,
            name: name.into(),
            ticker: None,
            maturity_date: None,
            notes: String::new(),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn account(id: i64, kind: AccountKind, balance: i64) -> FinanceAccount {
        FinanceAccount {
            id,
            name: format!("Conta {id}"),
            kind,
            color: CategoryColor::Slate,
            opening_balance: 0,
            balance,
            transaction_count: 0,
            closing_day: None,
            due_day: None,
        }
    }

    #[test]
    fn value_is_the_informed_one_plus_later_flows() {
        let movements = [
            movement(1, MovementKind::Contribution, "2026-08-01", 100_000, None),
            movement(2, MovementKind::Contribution, "2026-09-10", 50_000, None),
            movement(3, MovementKind::Income, "2026-09-20", 900, None),
        ];
        // Informado no mesmo dia da segunda aplicação: ela já está no valor.
        let informed = position(&movements, &[valuation("2026-09-10", 152_000)], date(TODAY));
        assert_eq!(informed.value, 152_000);
        assert_eq!(informed.value_status, ValueStatus::Informed);
        assert_eq!(informed.valued_on.as_deref(), Some("2026-09-10"));
        assert_eq!(informed.gain, 152_000 + 900 - 150_000);
        assert!(!informed.stale);

        // Informado antes: a aplicação de depois entra na conta, e o valor fica desatualizado.
        let adjusted = position(
            &movements,
            &[valuation("2026-07-01", 1), valuation("2026-08-31", 101_000)],
            date(TODAY),
        );
        assert_eq!(adjusted.value, 151_000);
        assert_eq!(adjusted.value_status, ValueStatus::Adjusted);
        assert!(adjusted.stale);

        let never = position(&movements, &[], date(TODAY));
        assert_eq!(never.value, 150_000);
        assert_eq!(never.value_status, ValueStatus::NotInformed);
        // Sem valor informado, o resultado é só o dos proventos.
        assert_eq!(never.gain, 900);
        assert_eq!(never.gain_rate, Some(900.0 / 150_000.0));
        assert!(never.stale);
    }

    #[test]
    fn old_values_ask_for_an_update() {
        let movements = [movement(
            1,
            MovementKind::Contribution,
            "2026-01-10",
            10_000,
            None,
        )];
        let recent = position(&movements, &[valuation("2026-08-26", 10_500)], date(TODAY));
        assert!(!recent.stale);
        let old = position(&movements, &[valuation("2026-08-25", 10_500)], date(TODAY));
        assert!(old.stale);
        // Ativo recém-cadastrado, sem nada: não há o que atualizar.
        assert!(!position(&[], &[], date(TODAY)).stale);
    }

    #[test]
    fn full_withdrawals_close_the_position() {
        let movements = [
            movement(1, MovementKind::Contribution, "2026-01-10", 100_000, None),
            movement(2, MovementKind::Withdrawal, "2026-09-15", 108_000, None),
        ];
        // Resgatou mais do que o último valor informado: nada sobra.
        let closed = position(&movements, &[valuation("2026-08-31", 107_500)], date(TODAY));
        assert_eq!(closed.value, 0);
        assert!(closed.closed && !closed.stale);
        assert_eq!(closed.gain, 8_000);
        assert_eq!(closed.invested, -8_000);

        // Resgate total com prejuízo: o "zero" informado na data encerra.
        let loss = [
            movement(1, MovementKind::Contribution, "2026-01-10", 100_000, None),
            movement(2, MovementKind::Withdrawal, "2026-09-15", 90_000, None),
        ];
        let zeroed = position(
            &loss,
            &[valuation("2026-08-31", 95_000), valuation("2026-09-15", 0)],
            date(TODAY),
        );
        assert!(zeroed.closed);
        assert_eq!(zeroed.gain, -10_000);
    }

    #[test]
    fn quantities_give_the_average_price() {
        let movements = [
            movement(
                1,
                MovementKind::Contribution,
                "2026-03-01",
                100_000,
                Some(units(100)),
            ),
            movement(
                2,
                MovementKind::Contribution,
                "2026-04-01",
                60_000,
                Some(units(50)),
            ),
            // Vende 30 cotas: o custo sai pelo preço médio (R$ 10,6667).
            movement(
                3,
                MovementKind::Withdrawal,
                "2026-05-01",
                36_000,
                Some(units(30)),
            ),
            movement(4, MovementKind::Income, "2026-06-01", 1_200, None),
        ];
        let held = position(&movements, &[valuation("2026-09-29", 132_000)], date(TODAY));
        assert_eq!(held.quantity, Some(units(120)));
        assert_eq!(held.average_price, Some(1_067));
        assert_eq!(held.gain, 132_000 + 36_000 + 1_200 - 160_000);

        // Vendeu tudo: valor zero mesmo com o último valor informado antigo.
        let mut sold = movements.to_vec();
        sold.push(movement(
            5,
            MovementKind::Withdrawal,
            "2026-09-30",
            140_000,
            Some(units(120)),
        ));
        let sold = position(&sold, &[valuation("2026-06-30", 200_000)], date(TODAY));
        assert_eq!((sold.quantity, sold.average_price), (Some(0), None));
        assert!(sold.closed);

        // Uma aplicação sem quantidade: sem preço médio.
        let mixed = [
            movement(
                1,
                MovementKind::Contribution,
                "2026-03-01",
                1_000,
                Some(units(1)),
            ),
            movement(2, MovementKind::Contribution, "2026-03-02", 1_000, None),
        ];
        let mixed = position(&mixed, &[], date(TODAY));
        assert_eq!((mixed.quantity, mixed.average_price), (None, None));
    }

    #[test]
    fn overview_splits_net_worth_without_double_counting() {
        let cdb = asset(1, 2, AssetClass::FixedIncome, "CDB C6");
        let tesouro = asset(2, 2, AssetClass::FixedIncome, "Tesouro Selic");
        let stock = asset(3, 3, AssetClass::Stocks, "ITSA4");
        let empty = asset(4, 3, AssetClass::Crypto, "Bitcoin");
        let overview = build_overview(
            vec![
                (
                    cdb,
                    vec![movement(
                        1,
                        MovementKind::Contribution,
                        "2026-08-01",
                        100_000,
                        None,
                    )],
                    vec![valuation("2026-09-29", 103_000)],
                ),
                (
                    tesouro,
                    vec![movement(
                        2,
                        MovementKind::Contribution,
                        "2026-08-01",
                        50_000,
                        None,
                    )],
                    vec![],
                ),
                (
                    stock,
                    vec![movement(
                        3,
                        MovementKind::Contribution,
                        "2026-08-01",
                        20_000,
                        None,
                    )],
                    vec![valuation("2026-09-29", 18_000)],
                ),
                (empty, vec![], vec![]),
            ],
            &[
                account(1, AccountKind::Checking, 500_000),
                // Recebeu R$ 1.600 em transferências (R$ 100 ainda parados na conta).
                account(2, AccountKind::Investment, 160_000),
                // Corretora com ações registradas sem a transferência (saldo zero).
                account(3, AccountKind::Investment, 0),
                account(4, AccountKind::CreditCard, -80_000),
            ],
            Vec::new(),
            date(TODAY),
        );
        let names: Vec<_> = overview.assets.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(names, vec!["CDB C6", "Tesouro Selic", "ITSA4", "Bitcoin"]);
        assert_eq!(overview.totals.value, 171_000);
        assert_eq!(overview.totals.gain, 1_000);
        assert_eq!(overview.stale_count, 1);
        assert_eq!(
            overview
                .by_class
                .iter()
                .map(|share| (share.class, share.value))
                .collect::<Vec<_>>(),
            vec![
                (AssetClass::FixedIncome, 153_000),
                (AssetClass::Stocks, 18_000)
            ]
        );
        assert!((overview.by_class[0].share - 153.0 / 171.0).abs() < 1e-9);
        assert_eq!(
            overview.accounts,
            vec![
                InvestmentAccountCash {
                    account_id: 2,
                    balance: 160_000,
                    net_contributions: 150_000,
                    cash: 10_000,
                },
                InvestmentAccountCash {
                    account_id: 3,
                    balance: 0,
                    net_contributions: 20_000,
                    cash: -20_000,
                },
            ]
        );
        assert_eq!(
            overview.net_worth,
            NetWorth {
                accounts: 420_000,
                investment_cash: -10_000,
                portfolio: 171_000,
                total: 581_000,
            }
        );
    }

    #[test]
    fn closed_assets_go_last() {
        let overview = build_overview(
            vec![
                (
                    asset(1, 2, AssetClass::FixedIncome, "Antigo"),
                    vec![
                        movement(1, MovementKind::Contribution, "2026-01-01", 1_000, None),
                        movement(2, MovementKind::Withdrawal, "2026-02-01", 1_000, None),
                    ],
                    vec![],
                ),
                (
                    asset(2, 2, AssetClass::FixedIncome, "Novo"),
                    vec![movement(
                        3,
                        MovementKind::Contribution,
                        "2026-01-01",
                        10,
                        None,
                    )],
                    vec![],
                ),
            ],
            &[account(2, AccountKind::Investment, 0)],
            Vec::new(),
            date(TODAY),
        );
        assert_eq!(overview.assets[1].name, "Antigo");
        assert!(overview.assets[1].position.closed);
        assert!(overview.by_class.len() == 1 && overview.by_class[0].share == 1.0);
    }

    #[test]
    fn transactions_map_to_movements() {
        assert_eq!(
            movement_kind_for(TransactionKind::Transfer, 1, Some(2), 2),
            Some(MovementKind::Contribution)
        );
        assert_eq!(
            movement_kind_for(TransactionKind::Transfer, 2, Some(1), 2),
            Some(MovementKind::Withdrawal)
        );
        assert_eq!(
            movement_kind_for(TransactionKind::Income, 1, None, 2),
            Some(MovementKind::Income)
        );
        assert_eq!(
            movement_kind_for(TransactionKind::Transfer, 1, Some(3), 2),
            None
        );
        assert_eq!(
            movement_kind_for(TransactionKind::Expense, 2, None, 2),
            None
        );
    }

    #[test]
    fn validates_assets() {
        let input =
            |class: AssetClass, name: &str, ticker: Option<&str>, maturity: Option<&str>| {
                AssetInput {
                    account_id: 1,
                    class,
                    name: name.into(),
                    ticker: ticker.map(Into::into),
                    maturity_date: maturity.map(Into::into),
                    notes: String::new(),
                }
            };
        let cdb = input(
            AssetClass::FixedIncome,
            "  CDB   C6 110% ",
            Some(" "),
            Some("2028-01-03"),
        )
        .validate()
        .unwrap();
        assert_eq!(cdb.name, "CDB C6 110%");
        assert_eq!(cdb.ticker, None);
        assert_eq!(cdb.maturity_date, Some(date("2028-01-03")));

        let stock = input(
            AssetClass::Stocks,
            "Itaúsa",
            Some("itsa4"),
            Some("2028-01-03"),
        )
        .validate()
        .unwrap();
        assert_eq!(stock.ticker.as_deref(), Some("ITSA4"));
        // Vencimento só na renda fixa.
        assert_eq!(stock.maturity_date, None);

        assert!(input(AssetClass::Other, " ", None, None)
            .validate()
            .is_err());
        assert!(input(AssetClass::Other, &"x".repeat(61), None, None)
            .validate()
            .is_err());
        assert!(input(AssetClass::Stocks, "X", Some("IT SA4"), None)
            .validate()
            .is_err());
        assert!(
            input(AssetClass::FixedIncome, "X", None, Some("2028-02-30"))
                .validate()
                .is_err()
        );
    }

    #[test]
    fn validates_movements_and_valuations() {
        let input = |kind: MovementKind, amount: i64, quantity: Option<i64>| MovementInput {
            kind,
            date: "2026-09-30".into(),
            amount,
            quantity,
            notes: String::new(),
            account_id: None,
            closes_position: true,
        };
        let income = input(MovementKind::Income, 500, Some(10))
            .validate()
            .unwrap();
        // Provento não tem quantidade nem encerra a posição.
        assert_eq!((income.quantity, income.closes_position), (None, false));
        assert!(
            input(MovementKind::Withdrawal, 500, None)
                .validate()
                .unwrap()
                .closes_position
        );
        assert!(input(MovementKind::Contribution, 0, None)
            .validate()
            .is_err());
        assert!(
            input(MovementKind::Contribution, MAX_AMOUNT_CENTS + 1, None)
                .validate()
                .is_err()
        );
        assert!(input(MovementKind::Contribution, 100, Some(0))
            .validate()
            .is_err());
        assert!(
            input(MovementKind::Contribution, 100, Some(MAX_QUANTITY + 1))
                .validate()
                .is_err()
        );

        let value = |value: i64, on: &str| ValuationInput {
            asset_id: 1,
            date: on.into(),
            value,
        };
        assert_eq!(value(0, "2026-09-30").validate().unwrap().value, 0);
        assert!(value(-1, "2026-09-30").validate().is_err());
        assert!(value(1, "30/09/2026").validate().is_err());
    }

    #[test]
    fn kinds_round_trip() {
        for class in [
            AssetClass::FixedIncome,
            AssetClass::Stocks,
            AssetClass::Reits,
            AssetClass::Etfs,
            AssetClass::Crypto,
            AssetClass::Other,
        ] {
            assert_eq!(AssetClass::parse(class.as_str()).unwrap(), class);
            assert_eq!(
                serde_json::to_value(class).unwrap(),
                serde_json::json!(class.as_str())
            );
        }
        for kind in [
            MovementKind::Contribution,
            MovementKind::Withdrawal,
            MovementKind::Income,
        ] {
            assert_eq!(MovementKind::parse(kind.as_str()).unwrap(), kind);
        }
        assert!(AssetClass::parse("bonds").is_err());
        assert!(MovementKind::parse("sale").is_err());
    }
}
