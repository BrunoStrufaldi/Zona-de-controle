//! Importação de extratos em duas etapas, como a limpeza:
//!
//! 1. `preview`: lê o arquivo (conteúdo enviado pela tela), marca os já
//!    importados, sugere tipo/categoria e guarda a leitura em memória.
//! 2. `commit`: a tela manda só as escolhas por linha (tipo, categoria, conta
//!    da transferência). Valores, datas, descrições e identificadores vêm da
//!    leitura guardada, nunca da tela. Tudo entra numa transação, com as regras
//!    aprendidas e o registro de auditoria; a prévia é consumida no sucesso.

use std::collections::HashSet;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::db::Database;
use crate::domain::audit::{AuditCategory, AuditOutcome, NewAuditEntry};
use crate::domain::calendar::CalendarDate;
use crate::domain::finance::accounts::AccountKind;
use crate::domain::finance::import::recurring_match::{match_lines, open_occurrences, LineFacts};
use crate::domain::finance::import::suggest::{
    description_key, learned_rules, preview_line, to_transaction, ImportDecision, PreviewLine,
};
use crate::domain::finance::import::{
    date_in_file_name, parse_statement, ImportFormat, ParsedStatement,
};
use crate::domain::finance::TransactionKind;
use crate::error::{AppError, AppResult};
use crate::repositories::{
    audit, finance_accounts, finance_import_rules, finance_recurring, finance_transactions,
};

pub const IMPORT_AUDIT_ACTION: &str = "finance_import.completed";
const EXPIRED_PREVIEW: &str = "Esta prévia não está mais disponível. Escolha o arquivo de novo.";
const MAX_FILE_NAME_CHARS: usize = 200;

/// Última prévia lida (só em memória).
#[derive(Default)]
pub struct ImportPreviewStore {
    state: Mutex<StoreState>,
}

#[derive(Default)]
struct StoreState {
    last_id: u64,
    latest: Option<StoredPreview>,
}

struct StoredPreview {
    id: u64,
    file_name: String,
    parsed: ParsedStatement,
}

impl ImportPreviewStore {
    pub fn new() -> Self {
        Self::default()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub preview_id: u64,
    pub file_name: String,
    pub format: ImportFormat,
    /// Tipo de conta provável, para a tela pré-selecionar a conta.
    pub account_kind: Option<AccountKind>,
    /// Fatura: vencimento encontrado no nome do arquivo (a tela pode trocar).
    pub statement_date: Option<String>,
    /// Primeira e última data das linhas.
    pub first_date: String,
    pub last_date: String,
    pub lines: Vec<PreviewLine>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCommitInput {
    pub preview_id: u64,
    pub account_id: i64,
    /// Obrigatório na fatura do cartão: vencimento (data dos lançamentos).
    #[serde(default)]
    pub statement_date: Option<String>,
    /// Só as linhas a importar.
    pub lines: Vec<ImportDecision>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub added: u32,
    /// Escolhidas, mas já importadas antes (puladas).
    pub duplicates: u32,
    /// Linhas do arquivo que não foram escolhidas.
    pub skipped: u32,
    /// Importadas e vinculadas a um vencimento de recorrente.
    pub linked: u32,
}

/// Lê o arquivo e monta a prévia (somente leitura no banco).
pub fn preview(
    db: &Database,
    store: &ImportPreviewStore,
    file_name: &str,
    content: &str,
) -> AppResult<ImportPreview> {
    let file_name = base_name(file_name);
    let parsed = parse_statement(content)?;
    let (existing, rules, accounts, series) = db.with_connection(|connection| {
        let ids: Vec<&str> = parsed
            .lines
            .iter()
            .map(|line| line.external_id.as_str())
            .collect();
        let accounts: Vec<(i64, AccountKind)> = finance_accounts::list(connection)?
            .into_iter()
            .map(|account| (account.id, account.kind))
            .collect();
        Ok((
            finance_transactions::existing_external_ids(connection, &ids)?,
            finance_import_rules::load(connection)?,
            accounts,
            finance_recurring::list(connection)?,
        ))
    })?;

    let dates = || parsed.lines.iter().map(|line| line.date);
    // Vencimentos de recorrentes em aberto perto das datas do arquivo.
    let matches = match (dates().min(), dates().max()) {
        (Some(first), Some(last)) => {
            let keys: Vec<Option<String>> = parsed
                .lines
                .iter()
                .map(|line| description_key(&line.description))
                .collect();
            let facts: Vec<Option<LineFacts<'_>>> = parsed
                .lines
                .iter()
                .zip(&keys)
                .map(|(line, key)| {
                    let eligible = !existing.contains(&line.external_id) && !line.bill_payment;
                    eligible.then_some(LineFacts {
                        date: line.date,
                        amount: line.amount,
                        key: key.as_deref(),
                    })
                })
                .collect();
            match_lines(&facts, &open_occurrences(&series, first, last))
        }
        _ => Vec::new(),
    };
    let lines: Vec<PreviewLine> = parsed
        .lines
        .iter()
        .zip(
            matches
                .into_iter()
                .chain(std::iter::repeat_with(Default::default)),
        )
        .enumerate()
        .map(|(index, (line, line_matches))| {
            let duplicate = existing.contains(&line.external_id);
            preview_line(index, line, duplicate, &rules, &accounts, line_matches)
        })
        .collect();
    let first_date = dates()
        .min()
        .map(|date| date.to_string())
        .unwrap_or_default();
    let last_date = dates()
        .max()
        .map(|date| date.to_string())
        .unwrap_or_default();
    let statement_date = (parsed.format == ImportFormat::C6CardCsv)
        .then(|| date_in_file_name(&file_name))
        .flatten()
        .map(|date| date.to_string());

    let mut state = store.state.lock().map_err(|_| AppError::StatePoisoned)?;
    state.last_id += 1;
    let preview_id = state.last_id;
    let result = ImportPreview {
        preview_id,
        file_name: file_name.clone(),
        format: parsed.format,
        account_kind: parsed.account_kind,
        statement_date,
        first_date,
        last_date,
        lines,
    };
    state.latest = Some(StoredPreview {
        id: preview_id,
        file_name,
        parsed,
    });
    Ok(result)
}

/// Importa as linhas escolhidas da prévia. Sucesso e falha vão para a auditoria.
pub fn commit(
    db: &Database,
    store: &ImportPreviewStore,
    input: ImportCommitInput,
) -> AppResult<ImportResult> {
    let mut state = store.state.lock().map_err(|_| AppError::StatePoisoned)?;
    let stored = state
        .latest
        .as_ref()
        .filter(|preview| preview.id == input.preview_id)
        .ok_or(AppError::NotFound(EXPIRED_PREVIEW))?;

    let target = input.account_id.to_string();
    let result = db.with_connection(|connection| {
        let outcome = import_lines(connection, stored, &input, &target);
        if let Err(error) = &outcome {
            // Melhor esforço: a falha original é o erro relevante.
            let _ = audit::record(
                connection,
                &audit_entry(
                    &target,
                    AuditOutcome::Failure,
                    json!({
                        "fileName": stored.file_name,
                        "format": stored.parsed.format.as_str(),
                        "error": error.to_string(),
                    }),
                ),
            );
        }
        outcome
    })?;

    // Consumida: a mesma prévia não é importada duas vezes.
    state.latest = None;
    Ok(result)
}

/// Valida as escolhas e insere tudo numa transação, com as regras aprendidas
/// e o registro de sucesso na auditoria.
fn import_lines(
    connection: &mut rusqlite::Connection,
    stored: &StoredPreview,
    input: &ImportCommitInput,
    target: &str,
) -> AppResult<ImportResult> {
    let lines = &stored.parsed.lines;
    let statement_date = input
        .statement_date
        .as_deref()
        .map(|value| {
            CalendarDate::parse(value)
                .ok_or_else(|| AppError::Validation(format!("vencimento inválido: {value}")))
        })
        .transpose()?;

    let mut seen = HashSet::new();
    let mut occurrences = HashSet::new();
    let mut prepared = Vec::with_capacity(input.lines.len());
    for decision in &input.lines {
        let line = lines
            .get(decision.index)
            .ok_or_else(|| AppError::Validation("linha inexistente na prévia".into()))?;
        if !seen.insert(decision.index) {
            return Err(AppError::Validation("linha repetida na importação".into()));
        }
        if let Some(occurrence) = &decision.recurring {
            if !occurrences.insert(occurrence) {
                return Err(AppError::Validation(format!(
                    "“{}”: o mesmo vencimento foi escolhido para duas linhas",
                    line.description
                )));
            }
        }
        let transaction = to_transaction(
            line,
            decision,
            input.account_id,
            stored.parsed.format,
            statement_date,
        )?;
        prepared.push((line, decision, transaction));
    }

    let transaction = connection.transaction()?;
    if !finance_accounts::exists(&transaction, input.account_id)? {
        return Err(AppError::Validation("conta não encontrada".into()));
    }
    let ids: Vec<&str> = prepared
        .iter()
        .map(|(line, _, _)| line.external_id.as_str())
        .collect();
    let existing = finance_transactions::existing_external_ids(&transaction, &ids)?;
    let series = finance_recurring::list(&transaction)?;

    let mut result = ImportResult {
        added: 0,
        duplicates: 0,
        skipped: (lines.len() - prepared.len()) as u32,
        linked: 0,
    };
    for (line, decision, valid) in &prepared {
        if existing.contains(&line.external_id) {
            result.duplicates += 1;
            continue;
        }
        // Valida o vínculo antes de gravar a linha.
        let occurrence = decision
            .recurring
            .as_ref()
            .map(|occurrence| {
                let problem = |message: &str| {
                    AppError::Validation(format!("“{}”: {message}", line.description))
                };
                let item = series
                    .iter()
                    .find(|item| item.id == occurrence.recurring_id)
                    .ok_or_else(|| problem("a recorrente escolhida não existe mais"))?;
                if item.kind == TransactionKind::Transfer || item.kind != decision.kind {
                    return Err(problem("o tipo não combina com o da recorrente"));
                }
                let date = CalendarDate::parse(&occurrence.occurrence_date)
                    .filter(|date| item.is_open(*date))
                    .ok_or_else(|| problem("o vencimento escolhido não está mais em aberto"))?;
                Ok((item.id, date))
            })
            .transpose()?;

        let transaction_id = finance_transactions::insert(&transaction, valid)?;
        for (pattern, target) in learned_rules(line, decision) {
            finance_import_rules::upsert(&transaction, &pattern, target)?;
        }
        if let Some((recurring_id, date)) = occurrence {
            finance_recurring::link(&transaction, recurring_id, date, transaction_id)?;
            // A descrição do extrato passa a identificar a recorrente.
            if let Some(key) = description_key(&line.description) {
                finance_recurring::set_import_key(&transaction, recurring_id, &key)?;
            }
            result.linked += 1;
        }
        result.added += 1;
    }
    audit::record(
        &transaction,
        &audit_entry(
            target,
            AuditOutcome::Success,
            json!({
                "fileName": stored.file_name,
                "format": stored.parsed.format.as_str(),
                "accountId": input.account_id,
                "added": result.added,
                "duplicates": result.duplicates,
                "skipped": result.skipped,
                "linked": result.linked,
            }),
        ),
    )?;
    transaction.commit()?;
    Ok(result)
}

fn audit_entry<'a>(
    target: &'a str,
    outcome: AuditOutcome,
    details: serde_json::Value,
) -> NewAuditEntry<'a> {
    NewAuditEntry {
        category: AuditCategory::Finance,
        action: IMPORT_AUDIT_ACTION,
        target: Some(target),
        outcome,
        details: Some(details),
    }
}

/// Só o nome do arquivo (sem pasta), limitado.
fn base_name(file_name: &str) -> String {
    let name = file_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default()
        .trim();
    let name: String = name.chars().take(MAX_FILE_NAME_CHARS).collect();
    if name.is_empty() {
        "arquivo".into()
    } else {
        name
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::finance::import::suggest::SuggestionReason;
    use crate::domain::finance::period::DateRange;
    use crate::domain::finance::TransactionKind;
    use crate::domain::task_categories::CategoryColor;
    use crate::services::finance;

    /// Extrato FICTÍCIO: um Pix enviado, o pagamento da fatura e uma aplicação.
    const OFX: &str = "<OFX><BANKACCTFROM><BANKID>999</BANKID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>
<STMTTRN><DTPOSTED>20260902</DTPOSTED><TRNAMT>-45.90</TRNAMT><FITID>F1</FITID><MEMO>POSTO EXEMPLO</MEMO></STMTTRN>
<STMTTRN><DTPOSTED>20260910</DTPOSTED><TRNAMT>-199.00</TRNAMT><FITID>F2</FITID><MEMO>Fatura de cartão</MEMO></STMTTRN>
<STMTTRN><DTPOSTED>20260911</DTPOSTED><TRNAMT>-1000.00</TRNAMT><FITID>F3</FITID><MEMO>APLICACAO CDB</MEMO></STMTTRN>
</OFX>";

    /// Fatura FICTÍCIA: uma compra parcelada e o pagamento da fatura anterior.
    const CARD: &str = "Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)
03/06/2026;FULANO;1234;Elétrico;LOJA EXEMPLO;3/6;0;0;199.00
20/08/2026;FULANO;1234;-;Inclusao de Pagamento;Única;0;0;-199.00
";

    fn account(db: &Database, name: &str, kind: AccountKind) -> i64 {
        finance::create_account(
            db,
            crate::domain::finance::accounts::AccountInput {
                name: name.into(),
                kind,
                color: CategoryColor::Slate,
                opening_balance: 0,
                closing_day: None,
                due_day: None,
            },
        )
        .unwrap()
        .id
    }

    fn category(db: &Database, name: &str) -> i64 {
        finance::list_categories(db)
            .unwrap()
            .into_iter()
            .find(|category| category.name == name)
            .unwrap()
            .id
    }

    /// Aceita as sugestões de todas as linhas marcadas.
    fn accept_all(preview: &ImportPreview, account_id: i64) -> ImportCommitInput {
        ImportCommitInput {
            preview_id: preview.preview_id,
            account_id,
            statement_date: preview.statement_date.clone(),
            lines: preview
                .lines
                .iter()
                .filter(|line| line.suggestion.include)
                .map(|line| ImportDecision {
                    index: line.index,
                    kind: line.suggestion.kind,
                    category_id: line.suggestion.category_id,
                    counterpart_account_id: line.suggestion.counterpart_account_id,
                    recurring: line.suggestion.recurring.clone(),
                })
                .collect(),
        }
    }

    #[test]
    fn imports_a_statement_once_with_transfers_and_audit() {
        let db = Database::open_in_memory().unwrap();
        let store = ImportPreviewStore::new();
        let checking = account(&db, "C6", AccountKind::Checking);
        let card = account(&db, "Cartão C6", AccountKind::CreditCard);
        let investments = account(&db, "Investimentos", AccountKind::Investment);

        let preview = preview(&db, &store, r"C:\Pasta\extrato.ofx", OFX).unwrap();
        assert_eq!(preview.file_name, "extrato.ofx");
        assert_eq!(preview.format, ImportFormat::Ofx);
        assert_eq!(preview.account_kind, Some(AccountKind::Checking));
        assert_eq!(
            (preview.first_date.as_str(), preview.last_date.as_str()),
            ("2026-09-02", "2026-09-11")
        );
        assert_eq!(
            preview.lines[1].suggestion.counterpart_account_id,
            Some(card)
        );
        assert_eq!(
            preview.lines[2].suggestion.reason,
            Some(SuggestionReason::Investment)
        );

        let mut input = accept_all(&preview, checking);
        input.lines[0].category_id = Some(category(&db, "Transporte"));
        let result = commit(&db, &store, input).unwrap();
        assert_eq!(
            result,
            ImportResult {
                added: 3,
                duplicates: 0,
                skipped: 0,
                linked: 0
            }
        );

        let balances: Vec<(i64, i64)> = finance::list_accounts(&db)
            .unwrap()
            .into_iter()
            .map(|account| (account.id, account.balance))
            .collect();
        assert!(balances.contains(&(checking, -124_490)));
        assert!(balances.contains(&(card, 19_900)));
        assert!(balances.contains(&(investments, 100_000)));

        // A prévia foi consumida.
        let again = accept_all(&preview, checking);
        assert!(matches!(
            commit(&db, &store, again),
            Err(AppError::NotFound(_))
        ));

        // Importar o mesmo arquivo de novo: tudo já existe, nada entra.
        let second = super::preview(&db, &store, "extrato.ofx", OFX).unwrap();
        assert!(second
            .lines
            .iter()
            .all(|line| line.duplicate && !line.suggestion.include));
        // A escolha de categoria virou regra para o posto.
        let second_line = &second.lines[0];
        assert_eq!(
            second_line.suggestion.reason,
            Some(SuggestionReason::Duplicate)
        );
        let rules = db
            .with_connection(|connection| finance_import_rules::load(connection))
            .unwrap();
        assert!(rules.contains_key("desc:posto exemplo"));

        let log = db
            .with_connection(|connection| audit::list_recent(connection, 5))
            .unwrap();
        assert_eq!(log[0].action, IMPORT_AUDIT_ACTION);
        assert_eq!(log[0].details.as_ref().unwrap()["added"], 3);
        // Transferências não entram nos totais do mês.
        let overview = finance::get_overview(&db, "2026-09").unwrap();
        assert_eq!(overview.totals.expenses, 4_590);
    }

    #[test]
    fn imports_the_card_bill_on_the_due_date() {
        let db = Database::open_in_memory().unwrap();
        let store = ImportPreviewStore::new();
        let card = account(&db, "Cartão C6", AccountKind::CreditCard);

        let preview = preview(&db, &store, "Fatura_2026-09-05.csv", CARD).unwrap();
        assert_eq!(preview.format, ImportFormat::C6CardCsv);
        assert_eq!(preview.statement_date.as_deref(), Some("2026-09-05"));
        // O pagamento da fatura anterior fica de fora.
        assert!(!preview.lines[1].suggestion.include);

        let result = commit(&db, &store, accept_all(&preview, card)).unwrap();
        assert_eq!(
            result,
            ImportResult {
                added: 1,
                duplicates: 0,
                skipped: 1,
                linked: 0
            }
        );

        let listed = finance::list_transactions(&db, "2026-09-01", "2026-09-30").unwrap();
        assert_eq!(listed.len(), 1);
        let purchase = &listed[0];
        assert_eq!(purchase.date, "2026-09-05");
        assert_eq!(purchase.purchase_date.as_deref(), Some("2026-06-03"));
        assert_eq!(
            purchase.installment.map(|i| (i.number, i.count)),
            Some((3, 6))
        );
        assert!(purchase.imported);
        assert_eq!(purchase.kind, TransactionKind::Expense);
        let range = DateRange::parse("2026-06-01", "2026-06-30").unwrap();
        assert!(db
            .with_connection(|connection| finance_transactions::list(connection, range))
            .unwrap()
            .is_empty());
    }

    #[test]
    fn a_failed_import_is_audited_and_keeps_the_preview() {
        let db = Database::open_in_memory().unwrap();
        let store = ImportPreviewStore::new();
        let card = account(&db, "Cartão C6", AccountKind::CreditCard);
        let preview = preview(&db, &store, "fatura.csv", CARD).unwrap();
        // Sem vencimento no nome, a tela precisa informar.
        assert_eq!(preview.statement_date, None);

        let missing_date = accept_all(&preview, card);
        assert!(matches!(
            commit(&db, &store, missing_date),
            Err(AppError::Validation(_))
        ));
        let log = db
            .with_connection(|connection| audit::list_recent(connection, 5))
            .unwrap();
        assert_eq!(log[0].outcome, "failure");

        // A prévia continua valendo para tentar de novo.
        let mut fixed = accept_all(&preview, card);
        fixed.statement_date = Some("2026-09-05".into());
        assert_eq!(commit(&db, &store, fixed).unwrap().added, 1);
    }

    #[test]
    fn links_statement_lines_to_recurring_occurrences() {
        use crate::domain::finance::recurring::{OccurrenceStatus, RecurringInput, RecurringRule};
        use crate::domain::task_recurrence::RecurrenceFrequency;
        use crate::services::finance_recurring;

        let db = Database::open_in_memory().unwrap();
        let store = ImportPreviewStore::new();
        let checking = account(&db, "C6", AccountKind::Checking);
        let fuel = category(&db, "Transporte");
        let series = finance_recurring::create(
            &db,
            RecurringInput {
                kind: TransactionKind::Expense,
                description: "Combustível".into(),
                amount: 4_590,
                account_id: checking,
                transfer_account_id: None,
                category_id: Some(fuel),
                start_date: "2026-09-01".into(),
                recurrence: RecurringRule {
                    frequency: RecurrenceFrequency::Monthly,
                    interval: 1,
                    until: None,
                    count: None,
                },
                notes: String::new(),
            },
        )
        .unwrap();

        let preview = preview(&db, &store, "extrato.ofx", OFX).unwrap();
        let fuel_line = &preview.lines[0];
        assert_eq!(
            fuel_line.suggestion.reason,
            Some(SuggestionReason::Recurring)
        );
        assert_eq!(fuel_line.suggestion.category_id, Some(fuel));
        assert_eq!(
            fuel_line
                .suggestion
                .recurring
                .as_ref()
                .map(|o| o.occurrence_date.as_str()),
            Some("2026-09-01")
        );
        assert_eq!(fuel_line.recurring_candidates.len(), 1);
        // A mesma ocorrência não pode ir para duas linhas.
        let mut twice = accept_all(&preview, checking);
        twice.lines[1].kind = TransactionKind::Expense;
        twice.lines[1].counterpart_account_id = None;
        twice.lines[1].recurring = fuel_line.suggestion.recurring.clone();
        assert!(matches!(
            commit(&db, &store, twice),
            Err(AppError::Validation(_))
        ));

        let result = commit(&db, &store, accept_all(&preview, checking)).unwrap();
        assert_eq!((result.added, result.linked), (3, 1));
        let overview = finance_recurring::list(&db, "2026-09-01", "2026-09-30").unwrap();
        assert_eq!(overview.occurrences[0].status, OccurrenceStatus::Paid);
        assert_eq!(
            overview.occurrences[0].transaction_date.as_deref(),
            Some("2026-09-02")
        );
        // A descrição do extrato ficou como chave da recorrente.
        let stored = db
            .with_connection(|connection| {
                crate::repositories::finance_recurring::find(connection, series.id)
            })
            .unwrap()
            .unwrap();
        assert_eq!(stored.import_key.as_deref(), Some("desc:posto exemplo"));
    }

    #[test]
    fn card_bill_lines_match_card_series_by_purchase_date() {
        use crate::domain::finance::recurring::{OccurrenceStatus, RecurringInput, RecurringRule};
        use crate::domain::task_recurrence::RecurrenceFrequency;
        use crate::services::finance_recurring;

        let db = Database::open_in_memory().unwrap();
        let store = ImportPreviewStore::new();
        let card = account(&db, "Cartão C6", AccountKind::CreditCard);
        finance_recurring::create(
            &db,
            RecurringInput {
                kind: TransactionKind::Expense,
                description: "Assinatura".into(),
                amount: 19_900,
                account_id: card,
                transfer_account_id: None,
                category_id: None,
                start_date: "2026-06-03".into(),
                recurrence: RecurringRule {
                    frequency: RecurrenceFrequency::Monthly,
                    interval: 1,
                    until: None,
                    count: None,
                },
                notes: String::new(),
            },
        )
        .unwrap();

        // A compra da fatura (03/06) casa com o vencimento de 03/06, não com o
        // vencimento da fatura (05/09), que é a data do lançamento.
        let preview = preview(&db, &store, "Fatura_2026-09-05.csv", CARD).unwrap();
        assert_eq!(
            preview.lines[0]
                .suggestion
                .recurring
                .as_ref()
                .map(|o| o.occurrence_date.as_str()),
            Some("2026-06-03")
        );
        commit(&db, &store, accept_all(&preview, card)).unwrap();
        let june = finance_recurring::list(&db, "2026-06-01", "2026-06-30").unwrap();
        assert_eq!(june.occurrences[0].status, OccurrenceStatus::Paid);
        assert_eq!(
            june.occurrences[0].transaction_date.as_deref(),
            Some("2026-09-05")
        );
    }

    #[test]
    fn rejects_invalid_choices() {
        let db = Database::open_in_memory().unwrap();
        let store = ImportPreviewStore::new();
        let checking = account(&db, "C6", AccountKind::Checking);
        let preview = preview(&db, &store, "extrato.ofx", OFX).unwrap();

        let mut repeated = accept_all(&preview, checking);
        repeated.lines.push(ImportDecision {
            index: 0,
            kind: TransactionKind::Expense,
            category_id: None,
            counterpart_account_id: None,
            recurring: None,
        });
        assert!(matches!(
            commit(&db, &store, repeated),
            Err(AppError::Validation(_))
        ));

        let mut out_of_range = accept_all(&preview, checking);
        out_of_range.lines[0].index = 99;
        assert!(commit(&db, &store, out_of_range).is_err());

        assert!(matches!(
            super::preview(&db, &store, "x.txt", "não é extrato"),
            Err(AppError::Validation(_))
        ));
    }
}
