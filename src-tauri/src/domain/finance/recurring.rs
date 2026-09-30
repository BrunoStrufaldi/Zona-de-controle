//! Lançamentos recorrentes (Fase 5.3): contas fixas e receitas que se repetem.
//! Espelhado em `src/features/finance/types.ts`.
//!
//! A série guarda só a regra; os vencimentos são calculados para o período
//! pedido, como no calendário (o motor de datas é o de `calendar_events`).
//! Cada vencimento é identificado pela data original. Resolvido = vinculado a
//! um lançamento (pago ou pendente) ou pulado; os demais estão em aberto ou
//! atrasados. Vencimentos resolvidos são histórico: aparecem mesmo que a regra
//! mude depois.
//!
//! Série de uma conta cartão de crédito ("no cartão"): a cobrança vem na
//! fatura, então não há o que pagar um a um. Sem lançamento, o vencimento fica
//! "previsto" e, passado o dia, "aguardando a fatura" (nunca atrasado); com o
//! lançamento vinculado (em geral pela importação da fatura), "na fatura".

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::domain::calendar::CalendarDate;
use crate::domain::calendar_events::EventRecurrence;
use crate::domain::finance::cards::CardCycle;
use crate::domain::finance::installments::StatementCharge;
use crate::domain::finance::transactions::{TransactionInput, TransactionStatus};
use crate::domain::finance::TransactionKind;
use crate::domain::task_recurrence::RecurrenceFrequency;
use crate::error::{AppError, AppResult};

pub const MAX_RECURRING: usize = 200;
pub const MAX_NOTES_CHARS: usize = 2_000;
/// A repetição pode terminar em até 100 anos (limita o cálculo das datas).
pub const MAX_SPAN_YEARS: i32 = 100;
/// "Termina em breve" (controle de renovação): último vencimento em até 30 dias.
pub const RENEWAL_NOTICE_DAYS: i64 = 30;
/// Atrasados de antes do período listados de uma vez.
pub const MAX_OVERDUE_LISTED: usize = 100;

// ---- Regra --------------------------------------------------------------------

/// Repetição a cada `interval` dias/semanas/meses/anos a partir do primeiro
/// vencimento. Termina, opcionalmente, em `until` (inclusive) ou após `count`
/// vencimentos. Mensal no dia 31 usa o último dia dos meses mais curtos.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurringRule {
    pub frequency: RecurrenceFrequency,
    #[serde(default = "default_interval")]
    pub interval: u32,
    #[serde(default)]
    pub until: Option<String>,
    #[serde(default)]
    pub count: Option<u32>,
}

fn default_interval() -> u32 {
    1
}

/// Primeiro vencimento + regra, já validados.
#[derive(Debug, Clone, PartialEq)]
pub struct Schedule {
    pub start: CalendarDate,
    rule: EventRecurrence,
}

impl Schedule {
    pub fn new(start: CalendarDate, rule: RecurringRule) -> AppResult<Self> {
        let rule = EventRecurrence {
            frequency: rule.frequency,
            interval: rule.interval,
            weekdays: Vec::new(),
            until: rule.until.map(|until| until.trim().to_string()),
            count: rule.count,
        }
        .validate(start)
        .map_err(|error| match error {
            // As mensagens do calendário falam de "evento".
            AppError::Validation(message) => {
                AppError::Validation(message.replace("do evento", "da recorrente"))
            }
            other => other,
        })?;
        if let Some(until) = rule.until.as_deref().and_then(CalendarDate::parse) {
            if until.year() - start.year() > MAX_SPAN_YEARS {
                return Err(AppError::Validation(format!(
                    "a repetição pode terminar em no máximo {MAX_SPAN_YEARS} anos"
                )));
            }
        }
        Ok(Self { start, rule })
    }

    pub fn rule(&self) -> RecurringRule {
        RecurringRule {
            frequency: self.rule.frequency,
            interval: self.rule.interval,
            until: self.rule.until.clone(),
            count: self.rule.count,
        }
    }

    /// Datas dos vencimentos, em ordem, a partir do primeiro.
    pub fn dates(&self) -> impl Iterator<Item = CalendarDate> + '_ {
        self.rule.dates(self.start)
    }

    pub fn is_rule_date(&self, date: CalendarDate) -> bool {
        self.dates()
            .take_while(|candidate| *candidate <= date)
            .any(|candidate| candidate == date)
    }

    /// Último vencimento, quando a repetição termina.
    pub fn last_date(&self) -> Option<CalendarDate> {
        if self.rule.until.is_none() && self.rule.count.is_none() {
            return None;
        }
        self.dates().last()
    }

    /// Mesmo primeiro vencimento, frequência e intervalo (o fim pode mudar à vontade).
    pub fn same_pattern(&self, other: &Self) -> bool {
        self.start == other.start
            && self.rule.frequency == other.rule.frequency
            && self.rule.interval == other.rule.interval
    }

    /// Distância máxima (em dias) entre o vencimento e a data de uma linha do
    /// extrato para sugerir o vínculo na importação.
    pub fn match_window_days(&self) -> i64 {
        match self.rule.frequency {
            RecurrenceFrequency::Daily => 0,
            RecurrenceFrequency::Weekly => 3,
            RecurrenceFrequency::Monthly | RecurrenceFrequency::Yearly => 10,
        }
    }

    /// Valor equivalente por mês (centavos, arredondado): semanal = 52/12 por
    /// mês, diária = 365/12, anual = 1/12, sempre dividido pelo intervalo.
    pub fn monthly_amount(&self, amount: i64) -> i64 {
        let (per_year, months) = match self.rule.frequency {
            RecurrenceFrequency::Daily => (365, 12),
            RecurrenceFrequency::Weekly => (52, 12),
            RecurrenceFrequency::Monthly => (1, 1),
            RecurrenceFrequency::Yearly => (1, 12),
        };
        let numerator = i128::from(amount) * per_year;
        let denominator = i128::from(months) * i128::from(self.rule.interval);
        ((numerator + denominator / 2) / denominator) as i64
    }
}

// ---- Entrada --------------------------------------------------------------------

/// Dados de criação/edição da série (substituição completa).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurringInput {
    pub kind: TransactionKind,
    pub description: String,
    pub amount: i64,
    pub account_id: i64,
    #[serde(default)]
    pub transfer_account_id: Option<i64>,
    #[serde(default)]
    pub category_id: Option<i64>,
    /// Primeiro vencimento acompanhado.
    pub start_date: String,
    pub recurrence: RecurringRule,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidRecurring {
    pub kind: TransactionKind,
    pub description: String,
    pub amount: i64,
    pub account_id: i64,
    pub transfer_account_id: Option<i64>,
    pub category_id: Option<i64>,
    pub schedule: Schedule,
    pub notes: String,
}

impl RecurringInput {
    pub fn validate(self) -> AppResult<ValidRecurring> {
        // Descrição, valor, contas e categoria seguem as regras do lançamento.
        let base = TransactionInput {
            account_id: self.account_id,
            transfer_account_id: self.transfer_account_id,
            category_id: self.category_id,
            kind: self.kind,
            description: self.description,
            amount: self.amount,
            date: self.start_date.clone(),
            status: TransactionStatus::Pending,
            notes: String::new(),
            tags: Vec::new(),
        }
        .validate()
        .map_err(|error| match error {
            AppError::Validation(message) if message.starts_with("data inválida") => {
                AppError::Validation(format!("primeiro vencimento inválido: {}", self.start_date))
            }
            other => other,
        })?;
        let notes = self.notes.trim().to_string();
        if notes.chars().count() > MAX_NOTES_CHARS {
            return Err(AppError::Validation(format!(
                "a observação pode ter no máximo {MAX_NOTES_CHARS} caracteres"
            )));
        }
        Ok(ValidRecurring {
            kind: base.kind,
            description: base.description,
            amount: base.amount,
            account_id: base.account_id,
            transfer_account_id: base.transfer_account_id,
            category_id: base.category_id,
            schedule: Schedule::new(base.date, self.recurrence)?,
            notes,
        })
    }
}

/// Com vencimentos já resolvidos, mudar o primeiro vencimento, a frequência ou
/// o intervalo só vale a partir de depois do último resolvido: assim o
/// histórico não se mistura com vencimentos recalculados.
pub fn check_schedule_change(
    current: &Schedule,
    next: &Schedule,
    last_resolved: Option<CalendarDate>,
) -> AppResult<()> {
    match last_resolved {
        Some(last) if !current.same_pattern(next) && next.start <= last => {
            Err(AppError::Validation(format!(
                "já há vencimentos registrados até {}: para mudar a repetição, escolha um \
                 primeiro vencimento depois dessa data",
                brazilian_date(last)
            )))
        }
        _ => Ok(()),
    }
}

/// `dd/mm/aaaa`, para mensagens de erro.
fn brazilian_date(date: CalendarDate) -> String {
    format!("{:02}/{:02}/{}", date.day(), date.month(), date.year())
}

// ---- Série e vencimentos ------------------------------------------------------

/// Vencimento resolvido.
#[derive(Debug, Clone, PartialEq)]
pub enum Resolution {
    /// Vinculado a um lançamento (valor, data e status são os do lançamento).
    Linked {
        transaction_id: i64,
        amount: i64,
        date: String,
        status: TransactionStatus,
    },
    Skipped,
}

/// Série como está no banco, com os vencimentos resolvidos.
#[derive(Debug, Clone, PartialEq)]
pub struct Series {
    pub id: i64,
    pub kind: TransactionKind,
    pub description: String,
    pub amount: i64,
    pub account_id: i64,
    pub transfer_account_id: Option<i64>,
    pub category_id: Option<i64>,
    pub schedule: Schedule,
    pub notes: String,
    pub import_key: Option<String>,
    /// A conta é um cartão de crédito: cobrada na fatura, sem pagamento um a um.
    pub on_card: bool,
    /// Dias de fechamento e vencimento do cartão, se informados.
    pub card_cycle: Option<CardCycle>,
    pub created_at: String,
    pub updated_at: String,
    pub resolved: BTreeMap<CalendarDate, Resolution>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OccurrenceStatus {
    /// A vencer, sem lançamento.
    Open,
    /// Venceu sem lançamento, ou o lançamento vinculado segue pendente.
    Overdue,
    /// Lançamento vinculado, pendente, ainda no prazo.
    Pending,
    /// Lançamento vinculado e pago/recebido (no cartão: já na fatura).
    Paid,
    Skipped,
    /// No cartão: o dia passou e a fatura com a cobrança ainda não foi importada.
    AwaitingStatement,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurringOccurrence {
    pub recurring_id: i64,
    /// Data do vencimento (identifica o vencimento na série).
    pub occurrence_date: String,
    pub status: OccurrenceStatus,
    /// Do lançamento vinculado; senão, o valor previsto da série.
    pub amount: i64,
    pub transaction_id: Option<i64>,
    pub transaction_date: Option<String>,
    /// No cartão com os dias da fatura, sem lançamento: vencimento da fatura
    /// em que a cobrança cai (data sugerida ao lançar à mão).
    pub statement_date: Option<String>,
}

impl Series {
    /// Vencimento em aberto (pela regra e ainda não resolvido)?
    pub fn is_open(&self, date: CalendarDate) -> bool {
        !self.resolved.contains_key(&date) && self.schedule.is_rule_date(date)
    }

    pub fn last_resolved(&self) -> Option<CalendarDate> {
        self.resolved.keys().next_back().copied()
    }

    fn occurrence(&self, date: CalendarDate, today: CalendarDate) -> RecurringOccurrence {
        let late = date < today;
        let (status, amount, transaction_id, transaction_date) = match self.resolved.get(&date) {
            None if late && self.on_card => {
                (OccurrenceStatus::AwaitingStatement, self.amount, None, None)
            }
            None if late => (OccurrenceStatus::Overdue, self.amount, None, None),
            None => (OccurrenceStatus::Open, self.amount, None, None),
            Some(Resolution::Skipped) => (OccurrenceStatus::Skipped, self.amount, None, None),
            Some(Resolution::Linked {
                transaction_id,
                amount,
                date: transaction_date,
                status,
            }) => {
                let status = match status {
                    _ if self.on_card => OccurrenceStatus::Paid,
                    TransactionStatus::Paid => OccurrenceStatus::Paid,
                    TransactionStatus::Pending if late => OccurrenceStatus::Overdue,
                    TransactionStatus::Pending => OccurrenceStatus::Pending,
                };
                (
                    status,
                    *amount,
                    Some(*transaction_id),
                    Some(transaction_date.clone()),
                )
            }
        };
        let statement_date = match (self.on_card, self.card_cycle, &transaction_id) {
            (true, Some(cycle), None) => Some(cycle.due_date_for(date).to_string()),
            _ => None,
        };
        RecurringOccurrence {
            recurring_id: self.id,
            occurrence_date: date.to_string(),
            status,
            amount,
            transaction_id,
            transaction_date,
            statement_date,
        }
    }

    /// Cobranças de uma despesa no cartão nas faturas que vencem de `from` a
    /// `to`: as vinculadas pela data do lançamento (na fatura importada, o
    /// vencimento) e as em aberto pelo ciclo do cartão. Sem os dias da fatura,
    /// só as vinculadas.
    pub fn statement_charges(&self, from: CalendarDate, to: CalendarDate) -> Vec<StatementCharge> {
        if !self.on_card || self.kind != TransactionKind::Expense {
            return Vec::new();
        }
        let in_range = |date: CalendarDate| date >= from && date <= to;
        let mut charges: Vec<StatementCharge> = self
            .resolved
            .values()
            .filter_map(|resolution| match resolution {
                Resolution::Linked { amount, date, .. } => CalendarDate::parse(date)
                    .filter(|date| in_range(*date))
                    .map(|due_date| StatementCharge {
                        due_date,
                        amount: *amount,
                    }),
                Resolution::Skipped => None,
            })
            .collect();
        if let Some(cycle) = self.card_cycle {
            // Uma cobrança cai no máximo ~2 meses depois (fechamento + vencimento).
            charges.extend(
                self.schedule
                    .dates()
                    .skip_while(|date| *date < from.add_days(-70))
                    .take_while(|date| *date <= to)
                    .filter(|date| !self.resolved.contains_key(date))
                    .map(|date| StatementCharge {
                        due_date: cycle.due_date_for(date),
                        amount: self.amount,
                    })
                    .filter(|charge| in_range(charge.due_date)),
            );
        }
        charges
    }

    /// Vencimentos em aberto que ainda vão mexer no saldo, de hoje até `to`,
    /// pela data em que o dinheiro sai ou entra: fora do cartão, o próprio
    /// vencimento; no cartão, o vencimento da fatura (sem os dias da fatura, a
    /// data da cobrança). Atrasados fora do cartão ficam de fora: podem já ter
    /// sido pagos sem vínculo, e a tela de Recorrentes cuida deles.
    pub fn upcoming_open(&self, today: CalendarDate, to: CalendarDate) -> Vec<StatementCharge> {
        if self.kind == TransactionKind::Transfer {
            return Vec::new();
        }
        let cycle = self.card_cycle.filter(|_| self.on_card);
        // No cartão, uma cobrança de até ~2 meses atrás ainda pode estar numa fatura a vencer.
        let since = if cycle.is_some() {
            today.add_days(-70)
        } else {
            today
        };
        self.schedule
            .dates()
            .skip_while(|date| *date < since)
            .take_while(|date| *date <= to)
            .filter(|date| !self.resolved.contains_key(date))
            .map(|date| StatementCharge {
                due_date: cycle.map_or(date, |cycle| cycle.due_date_for(date)),
                amount: self.amount,
            })
            .filter(|charge| charge.due_date >= today && charge.due_date <= to)
            .collect()
    }

    /// Vencimentos de `from` a `to`: os da regra e os resolvidos (histórico).
    pub fn occurrences(
        &self,
        from: CalendarDate,
        to: CalendarDate,
        today: CalendarDate,
    ) -> Vec<RecurringOccurrence> {
        let mut dates: Vec<CalendarDate> = self
            .schedule
            .dates()
            .take_while(|date| *date <= to)
            .filter(|date| *date >= from && !self.resolved.contains_key(date))
            .collect();
        dates.extend(self.resolved.range(from..=to).map(|(date, _)| *date));
        dates.sort_unstable();
        dates
            .into_iter()
            .map(|date| self.occurrence(date, today))
            .collect()
    }

    /// Atrasados (em aberto ou com lançamento pendente) antes de `before`.
    /// No cartão nada atrasa: a cobrança é da fatura.
    pub fn overdue_before(
        &self,
        before: CalendarDate,
        today: CalendarDate,
    ) -> Vec<RecurringOccurrence> {
        if self.on_card {
            return Vec::new();
        }
        let limit = before.min(today);
        let mut dates: Vec<CalendarDate> = self
            .schedule
            .dates()
            .take_while(|date| *date < limit)
            .filter(|date| !self.resolved.contains_key(date))
            .collect();
        dates.extend(
            self.resolved
                .range(..limit)
                .filter(|(_, resolution)| {
                    matches!(
                        resolution,
                        Resolution::Linked {
                            status: TransactionStatus::Pending,
                            ..
                        }
                    )
                })
                .map(|(date, _)| *date),
        );
        dates.sort_unstable();
        dates
            .into_iter()
            .map(|date| self.occurrence(date, today))
            .collect()
    }

    /// Primeiro vencimento em aberto a partir de hoje.
    pub fn next_open(&self, today: CalendarDate) -> Option<CalendarDate> {
        self.schedule
            .dates()
            .find(|date| *date >= today && !self.resolved.contains_key(date))
    }

    pub fn view(&self, today: CalendarDate) -> RecurringSeriesView {
        let last_date = self.schedule.last_date();
        let ended = last_date.is_some_and(|last| last < today);
        let ends_soon =
            !ended && last_date.is_some_and(|last| today.days_until(last) <= RENEWAL_NOTICE_DAYS);
        RecurringSeriesView {
            id: self.id,
            kind: self.kind,
            description: self.description.clone(),
            amount: self.amount,
            account_id: self.account_id,
            transfer_account_id: self.transfer_account_id,
            category_id: self.category_id,
            start_date: self.schedule.start.to_string(),
            recurrence: self.schedule.rule(),
            notes: self.notes.clone(),
            on_card: self.on_card,
            next_date: self.next_open(today).map(|date| date.to_string()),
            last_date: last_date.map(|date| date.to_string()),
            ended,
            ends_soon,
            overdue_count: self.overdue_before(today, today).len() as u32,
            last_resolved_date: self.last_resolved().map(|date| date.to_string()),
            monthly_amount: self.schedule.monthly_amount(self.amount),
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
        }
    }
}

// ---- Contrato com o frontend ---------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurringSeriesView {
    pub id: i64,
    pub kind: TransactionKind,
    pub description: String,
    /// Valor previsto (centavos).
    pub amount: i64,
    pub account_id: i64,
    pub transfer_account_id: Option<i64>,
    pub category_id: Option<i64>,
    pub start_date: String,
    pub recurrence: RecurringRule,
    pub notes: String,
    /// A conta é um cartão de crédito (cobrada na fatura).
    pub on_card: bool,
    /// Próximo vencimento em aberto (de hoje em diante).
    pub next_date: Option<String>,
    /// Último vencimento, quando a repetição termina.
    pub last_date: Option<String>,
    /// Já passou do último vencimento.
    pub ended: bool,
    /// Termina em até [`RENEWAL_NOTICE_DAYS`] dias (hora de renovar ou cancelar).
    pub ends_soon: bool,
    pub overdue_count: u32,
    /// Vencimento resolvido mais recente (mudar a repetição só vale depois dele).
    pub last_resolved_date: Option<String>,
    /// Valor equivalente por mês.
    pub monthly_amount: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Previsto e realizado no período (sem transferências e sem os pulados).
/// Realizado = pago/recebido ou, no cartão, já na fatura.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedTotals {
    pub expenses: i64,
    pub expenses_realized: i64,
    pub income: i64,
    pub income_realized: i64,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurringSummary {
    /// Soma do equivalente mensal das séries ativas.
    pub monthly_expenses: i64,
    /// Parte de `monthly_expenses` cobrada no cartão.
    pub monthly_card_expenses: i64,
    pub monthly_income: i64,
    /// Todos os atrasados (inclusive os do período).
    pub overdue_count: u32,
    pub overdue_expenses: i64,
    pub overdue_income: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurringOverview {
    pub today: String,
    /// Ativas primeiro (pelo próximo vencimento); encerradas no fim.
    pub series: Vec<RecurringSeriesView>,
    /// Vencimentos do período, por data.
    pub occurrences: Vec<RecurringOccurrence>,
    /// Atrasados de antes do período (até [`MAX_OVERDUE_LISTED`]).
    pub overdue: Vec<RecurringOccurrence>,
    pub totals: PlannedTotals,
    pub summary: RecurringSummary,
}

/// Monta a visão das séries para o período `[from, to]`.
pub fn build_overview(
    series: &[Series],
    from: CalendarDate,
    to: CalendarDate,
    today: CalendarDate,
) -> RecurringOverview {
    let kinds: BTreeMap<i64, TransactionKind> = series.iter().map(|s| (s.id, s.kind)).collect();

    let mut views: Vec<RecurringSeriesView> = series.iter().map(|s| s.view(today)).collect();
    views.sort_by(|a, b| {
        (a.ended, a.next_date.is_none(), &a.next_date)
            .cmp(&(b.ended, b.next_date.is_none(), &b.next_date))
            .then_with(|| {
                a.description
                    .to_lowercase()
                    .cmp(&b.description.to_lowercase())
            })
            .then(a.id.cmp(&b.id))
    });

    let mut occurrences: Vec<RecurringOccurrence> = series
        .iter()
        .flat_map(|s| s.occurrences(from, to, today))
        .collect();
    occurrences.sort_by(|a, b| {
        (&a.occurrence_date, a.recurring_id).cmp(&(&b.occurrence_date, b.recurring_id))
    });

    let mut overdue: Vec<RecurringOccurrence> = series
        .iter()
        .flat_map(|s| s.overdue_before(from, today))
        .collect();
    overdue.sort_by(|a, b| {
        (&a.occurrence_date, a.recurring_id).cmp(&(&b.occurrence_date, b.recurring_id))
    });
    overdue.truncate(MAX_OVERDUE_LISTED);

    let mut totals = PlannedTotals::default();
    for occurrence in &occurrences {
        if occurrence.status == OccurrenceStatus::Skipped {
            continue;
        }
        let realized = occurrence.status == OccurrenceStatus::Paid;
        match kinds.get(&occurrence.recurring_id) {
            Some(TransactionKind::Expense) => {
                totals.expenses += occurrence.amount;
                if realized {
                    totals.expenses_realized += occurrence.amount;
                }
            }
            Some(TransactionKind::Income) => {
                totals.income += occurrence.amount;
                if realized {
                    totals.income_realized += occurrence.amount;
                }
            }
            _ => {}
        }
    }

    let mut summary = RecurringSummary::default();
    for (item, view) in series.iter().map(|s| (s, s.view(today))) {
        let active = !view.ended;
        match item.kind {
            TransactionKind::Expense if active => {
                summary.monthly_expenses += view.monthly_amount;
                if item.on_card {
                    summary.monthly_card_expenses += view.monthly_amount;
                }
            }
            TransactionKind::Income if active => summary.monthly_income += view.monthly_amount,
            _ => {}
        }
        for late in item.overdue_before(today, today) {
            summary.overdue_count += 1;
            match item.kind {
                TransactionKind::Expense => summary.overdue_expenses += late.amount,
                TransactionKind::Income => summary.overdue_income += late.amount,
                TransactionKind::Transfer => {}
            }
        }
    }

    RecurringOverview {
        today: today.to_string(),
        series: views,
        occurrences,
        overdue,
        totals,
        summary,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use RecurrenceFrequency::{Daily, Monthly, Weekly, Yearly};

    fn date(value: &str) -> CalendarDate {
        CalendarDate::parse(value).unwrap()
    }

    fn rule(frequency: RecurrenceFrequency, interval: u32) -> RecurringRule {
        RecurringRule {
            frequency,
            interval,
            until: None,
            count: None,
        }
    }

    fn schedule(start: &str, rule: RecurringRule) -> Schedule {
        Schedule::new(date(start), rule).unwrap()
    }

    fn series(kind: TransactionKind, amount: i64, schedule: Schedule) -> Series {
        Series {
            id: 1,
            kind,
            description: "Aluguel".into(),
            amount,
            account_id: 1,
            transfer_account_id: None,
            category_id: None,
            schedule,
            notes: String::new(),
            import_key: None,
            on_card: false,
            card_cycle: None,
            created_at: String::new(),
            updated_at: String::new(),
            resolved: BTreeMap::new(),
        }
    }

    fn linked(id: i64, amount: i64, status: TransactionStatus) -> Resolution {
        Resolution::Linked {
            transaction_id: id,
            amount,
            date: "2026-09-06".into(),
            status,
        }
    }

    fn input() -> RecurringInput {
        RecurringInput {
            kind: TransactionKind::Expense,
            description: "  Internet ".into(),
            amount: 9_990,
            account_id: 1,
            transfer_account_id: None,
            category_id: Some(3),
            start_date: "2026-09-10".into(),
            recurrence: rule(Monthly, 1),
            notes: "  ".into(),
        }
    }

    #[test]
    fn validates_the_input() {
        let valid = input().validate().unwrap();
        assert_eq!(valid.description, "Internet");
        assert_eq!(valid.schedule.start, date("2026-09-10"));
        assert_eq!(valid.notes, "");

        let with = |change: fn(&mut RecurringInput)| {
            let mut value = input();
            change(&mut value);
            value.validate()
        };
        assert!(with(|r| r.description = " ".into()).is_err());
        assert!(with(|r| r.amount = 0).is_err());
        assert!(with(|r| r.start_date = "2026-02-30".into()).is_err());
        assert!(with(|r| r.recurrence.interval = 0).is_err());
        assert!(with(|r| r.recurrence.until = Some("2026-09-09".into())).is_err());
        assert!(with(|r| r.recurrence.until = Some("2127-01-01".into())).is_err());
        assert!(with(|r| r.recurrence.count = Some(0)).is_err());
        assert!(with(|r| r.notes = "x".repeat(MAX_NOTES_CHARS + 1)).is_err());
        // Transferência: conta de destino obrigatória e sem categoria.
        assert!(with(|r| r.kind = TransactionKind::Transfer).is_err());
        let transfer = with(|r| {
            r.kind = TransactionKind::Transfer;
            r.transfer_account_id = Some(2);
        })
        .unwrap();
        assert_eq!(
            (transfer.transfer_account_id, transfer.category_id),
            (Some(2), None)
        );
    }

    #[test]
    fn computes_dates_end_and_monthly_amount() {
        let monthly = schedule("2026-01-31", rule(Monthly, 1));
        let dates: Vec<String> = monthly.dates().take(3).map(|d| d.to_string()).collect();
        assert_eq!(dates, ["2026-01-31", "2026-02-28", "2026-03-31"]);
        assert!(monthly.is_rule_date(date("2026-02-28")));
        assert!(!monthly.is_rule_date(date("2026-02-27")));
        assert_eq!(monthly.last_date(), None);

        let mut limited = rule(Monthly, 1);
        limited.count = Some(12);
        assert_eq!(
            schedule("2026-01-05", limited).last_date(),
            Some(date("2026-12-05"))
        );
        let mut until = rule(Yearly, 1);
        until.until = Some("2028-06-30".into());
        assert_eq!(
            schedule("2026-03-10", until).last_date(),
            Some(date("2028-03-10"))
        );

        assert_eq!(
            schedule("2026-01-01", rule(Monthly, 1)).monthly_amount(10_000),
            10_000
        );
        assert_eq!(
            schedule("2026-01-01", rule(Monthly, 2)).monthly_amount(10_000),
            5_000
        );
        assert_eq!(
            schedule("2026-01-01", rule(Yearly, 1)).monthly_amount(120_000),
            10_000
        );
        // 52 semanas / 12 meses.
        assert_eq!(
            schedule("2026-01-01", rule(Weekly, 1)).monthly_amount(3_000),
            13_000
        );
        assert_eq!(
            schedule("2026-01-01", rule(Daily, 1)).monthly_amount(1_000),
            30_417
        );
    }

    #[test]
    fn classifies_occurrences_in_a_range() {
        let mut rent = series(
            TransactionKind::Expense,
            200_000,
            schedule("2026-07-05", rule(Monthly, 1)),
        );
        rent.resolved.insert(
            date("2026-07-05"),
            linked(10, 200_000, TransactionStatus::Paid),
        );
        rent.resolved.insert(
            date("2026-08-05"),
            linked(11, 210_000, TransactionStatus::Pending),
        );
        rent.resolved
            .insert(date("2026-09-05"), Resolution::Skipped);
        let today = date("2026-10-20");

        let found = rent.occurrences(date("2026-07-01"), date("2026-11-30"), today);
        let statuses: Vec<_> = found
            .iter()
            .map(|o| (o.occurrence_date.as_str(), o.status, o.amount))
            .collect();
        assert_eq!(
            statuses,
            vec![
                ("2026-07-05", OccurrenceStatus::Paid, 200_000),
                ("2026-08-05", OccurrenceStatus::Overdue, 210_000),
                ("2026-09-05", OccurrenceStatus::Skipped, 200_000),
                ("2026-10-05", OccurrenceStatus::Overdue, 200_000),
                ("2026-11-05", OccurrenceStatus::Open, 200_000),
            ]
        );
        assert_eq!(found[1].transaction_id, Some(11));

        // Atrasados antes de outubro: o pendente de agosto.
        let before = rent.overdue_before(date("2026-10-01"), today);
        assert_eq!(before.len(), 1);
        assert_eq!(before[0].occurrence_date, "2026-08-05");
        assert_eq!(rent.next_open(today), Some(date("2026-11-05")));
        assert!(rent.is_open(date("2026-10-05")));
        assert!(!rent.is_open(date("2026-09-05")));
        assert!(!rent.is_open(date("2026-10-06")));
    }

    #[test]
    fn resolved_history_survives_a_new_schedule() {
        let mut rent = series(
            TransactionKind::Expense,
            200_000,
            schedule("2026-10-10", rule(Monthly, 1)),
        );
        // Pago no dia 5, antes da mudança para o dia 10.
        rent.resolved.insert(
            date("2026-09-05"),
            linked(10, 200_000, TransactionStatus::Paid),
        );
        let found = rent.occurrences(date("2026-09-01"), date("2026-10-31"), date("2026-09-29"));
        let dates: Vec<_> = found.iter().map(|o| o.occurrence_date.as_str()).collect();
        assert_eq!(dates, ["2026-09-05", "2026-10-10"]);
    }

    #[test]
    fn schedule_changes_start_after_the_history() {
        let current = schedule("2026-01-05", rule(Monthly, 1));
        let moved = schedule("2026-09-10", rule(Monthly, 1));
        let last = Some(date("2026-09-05"));
        assert!(check_schedule_change(&current, &moved, last).is_ok());
        let too_early = schedule("2026-01-10", rule(Monthly, 1));
        assert!(check_schedule_change(&current, &too_early, last).is_err());
        // Sem histórico, ou mudando só o fim, tudo vale.
        assert!(check_schedule_change(&current, &too_early, None).is_ok());
        let mut ending = rule(Monthly, 1);
        ending.until = Some("2026-12-31".into());
        assert!(check_schedule_change(&current, &schedule("2026-01-05", ending), last).is_ok());
    }

    #[test]
    fn views_flag_renewals_and_endings() {
        let today = date("2026-09-29");
        let mut yearly = rule(Yearly, 1);
        yearly.count = Some(2);
        let ending = series(
            TransactionKind::Expense,
            50_000,
            schedule("2025-10-15", yearly),
        );
        let view = ending.view(today);
        assert_eq!(view.last_date.as_deref(), Some("2026-10-15"));
        assert!(view.ends_soon && !view.ended);
        // O de 2025 ficou em aberto: atrasado.
        assert_eq!(view.overdue_count, 1);
        assert_eq!(view.next_date.as_deref(), Some("2026-10-15"));

        let ended = ending.view(date("2026-10-16"));
        assert!(ended.ended && !ended.ends_soon);
        assert_eq!(ended.next_date, None);
    }

    #[test]
    fn card_charges_wait_for_the_statement_instead_of_running_late() {
        let today = date("2026-10-20");
        let mut streaming = series(
            TransactionKind::Expense,
            5_590,
            schedule("2026-08-15", rule(Monthly, 1)),
        );
        streaming.on_card = true;
        // Importado da fatura (lançamentos da fatura podem vir pendentes também).
        streaming.resolved.insert(
            date("2026-08-15"),
            linked(3, 5_590, TransactionStatus::Pending),
        );

        let found = streaming.occurrences(date("2026-08-01"), date("2026-11-30"), today);
        let statuses: Vec<_> = found.iter().map(|o| o.status).collect();
        assert_eq!(
            statuses,
            vec![
                OccurrenceStatus::Paid,
                OccurrenceStatus::AwaitingStatement,
                OccurrenceStatus::AwaitingStatement,
                OccurrenceStatus::Open,
            ]
        );
        assert!(streaming.overdue_before(today, today).is_empty());
        let view = streaming.view(today);
        assert!(view.on_card);
        assert_eq!(view.overdue_count, 0);
        // Continua valendo para registrar ou vincular.
        assert!(streaming.is_open(date("2026-09-15")));

        let overview = build_overview(&[streaming], date("2026-08-01"), date("2026-08-31"), today);
        assert_eq!(overview.totals.expenses_realized, 5_590);
        assert_eq!(overview.summary.monthly_card_expenses, 5_590);
        assert_eq!(overview.summary.overdue_count, 0);
    }

    #[test]
    fn card_charges_fall_into_their_statements() {
        let mut streaming = series(
            TransactionKind::Expense,
            5_590,
            schedule("2026-08-15", rule(Monthly, 1)),
        );
        streaming.on_card = true;
        // Agosto veio na fatura de 05/09.
        streaming.resolved.insert(
            date("2026-08-15"),
            Resolution::Linked {
                transaction_id: 1,
                amount: 5_490,
                date: "2026-09-05".into(),
                status: TransactionStatus::Paid,
            },
        );
        let (from, to) = (date("2026-09-01"), date("2026-11-30"));
        // Sem os dias da fatura: só a vinculada.
        assert_eq!(streaming.statement_charges(from, to).len(), 1);

        streaming.card_cycle = Some(CardCycle {
            closing_day: 28,
            due_day: 5,
        });
        let dues: Vec<(String, i64)> = streaming
            .statement_charges(from, to)
            .into_iter()
            .map(|charge| (charge.due_date.to_string(), charge.amount))
            .collect();
        assert_eq!(
            dues,
            vec![
                ("2026-09-05".to_string(), 5_490),
                ("2026-10-05".to_string(), 5_590),
                ("2026-11-05".to_string(), 5_590),
            ]
        );
        let open =
            streaming.occurrences(date("2026-09-01"), date("2026-09-30"), date("2026-09-01"));
        assert_eq!(open[0].statement_date.as_deref(), Some("2026-10-05"));
    }

    #[test]
    fn upcoming_open_is_when_the_money_moves() {
        let dues = |series: &Series| -> Vec<String> {
            series
                .upcoming_open(date("2026-09-20"), date("2026-12-31"))
                .iter()
                .map(|charge| charge.due_date.to_string())
                .collect()
        };
        // Fora do cartão: do dia em diante; o atrasado (10/09) e o resolvido ficam de fora.
        let mut rent = series(
            TransactionKind::Expense,
            200_000,
            schedule("2026-08-10", rule(Monthly, 1)),
        );
        rent.resolved.insert(
            date("2026-10-10"),
            linked(1, 200_000, TransactionStatus::Pending),
        );
        assert_eq!(dues(&rent), vec!["2026-11-10", "2026-12-10"]);

        // No cartão (fecha 28, vence 5): a cobrança de 15/09 ainda cai na fatura de 05/10.
        let mut streaming = series(
            TransactionKind::Expense,
            5_590,
            schedule("2026-08-15", rule(Monthly, 1)),
        );
        streaming.on_card = true;
        streaming.card_cycle = Some(CardCycle {
            closing_day: 28,
            due_day: 5,
        });
        assert_eq!(
            dues(&streaming),
            vec!["2026-10-05", "2026-11-05", "2026-12-05"]
        );
        // Sem os dias da fatura: pela data da cobrança.
        streaming.card_cycle = None;
        assert_eq!(
            dues(&streaming),
            vec!["2026-10-15", "2026-11-15", "2026-12-15"]
        );
        streaming.kind = TransactionKind::Transfer;
        assert!(dues(&streaming).is_empty());
    }

    #[test]
    fn overview_sums_the_period_and_the_monthly_commitment() {
        let today = date("2026-09-20");
        let mut rent = series(
            TransactionKind::Expense,
            200_000,
            schedule("2026-08-05", rule(Monthly, 1)),
        );
        rent.resolved.insert(
            date("2026-09-05"),
            linked(1, 205_000, TransactionStatus::Paid),
        );
        let mut salary = series(
            TransactionKind::Income,
            800_000,
            schedule("2026-09-30", rule(Monthly, 1)),
        );
        salary.id = 2;
        let mut gym = series(
            TransactionKind::Expense,
            12_000,
            schedule("2026-09-25", rule(Monthly, 1)),
        );
        gym.id = 3;
        gym.resolved.insert(date("2026-09-25"), Resolution::Skipped);
        let mut invest = series(
            TransactionKind::Transfer,
            100_000,
            schedule("2026-09-10", rule(Monthly, 1)),
        );
        invest.id = 4;
        invest.transfer_account_id = Some(2);

        let overview = build_overview(
            &[rent, salary, gym, invest],
            date("2026-09-01"),
            date("2026-09-30"),
            today,
        );
        assert_eq!(
            overview.totals,
            PlannedTotals {
                expenses: 205_000,
                expenses_realized: 205_000,
                income: 800_000,
                income_realized: 0,
            }
        );
        assert_eq!(overview.occurrences.len(), 4);
        // Agosto do aluguel ficou em aberto: atrasado de antes do período.
        assert_eq!(overview.overdue.len(), 1);
        assert_eq!(overview.overdue[0].occurrence_date, "2026-08-05");
        assert_eq!(
            overview.summary,
            RecurringSummary {
                monthly_expenses: 212_000,
                monthly_card_expenses: 0,
                monthly_income: 800_000,
                // Agosto do aluguel e o aporte de 10/09 (transferência não soma valor).
                overdue_count: 2,
                overdue_expenses: 200_000,
                overdue_income: 0,
            }
        );
        // Ordem: pelo próximo vencimento em aberto.
        let order: Vec<i64> = overview.series.iter().map(|s| s.id).collect();
        assert_eq!(order, vec![2, 1, 4, 3]);
    }
}
