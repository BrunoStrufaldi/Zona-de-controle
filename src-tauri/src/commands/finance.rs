use tauri::State;

use crate::domain::finance::accounts::{AccountInput, FinanceAccount};
use crate::domain::finance::analytics::FinanceAnalytics;
use crate::domain::finance::categories::{CategoryInput, CategoryUpdate, FinanceCategory};
use crate::domain::finance::installments::InstallmentsOverview;
use crate::domain::finance::overview::FinanceOverview;
use crate::domain::finance::recurring::{RecurringInput, RecurringOverview, RecurringSeriesView};
use crate::domain::finance::transactions::{Transaction, TransactionInput, TransactionStatus};
use crate::error::AppResult;
use crate::services::finance as service;
use crate::services::finance_analytics as analytics;
use crate::services::finance_import::{
    self as import, ImportCommitInput, ImportPreview, ImportResult,
};
use crate::services::finance_installments as installments;
use crate::services::finance_recurring as recurring;
use crate::state::AppState;

/// Contas com saldo e quantidade de lançamentos (somente leitura).
#[tauri::command]
pub async fn list_finance_accounts(state: State<'_, AppState>) -> AppResult<Vec<FinanceAccount>> {
    service::list_accounts(&state.db)
}

#[tauri::command]
pub async fn create_finance_account(
    state: State<'_, AppState>,
    input: AccountInput,
) -> AppResult<FinanceAccount> {
    service::create_account(&state.db, input)
}

#[tauri::command]
pub async fn update_finance_account(
    state: State<'_, AppState>,
    id: i64,
    input: AccountInput,
) -> AppResult<FinanceAccount> {
    service::update_account(&state.db, id, input)
}

/// Exclusão definitiva de uma conta sem lançamentos (destrutiva, auditada).
/// A interface pede confirmação antes.
#[tauri::command]
pub async fn delete_finance_account(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    service::delete_account(&state.db, id)
}

/// Categorias de receita e despesa com a contagem de lançamentos (somente leitura).
#[tauri::command]
pub async fn list_finance_categories(
    state: State<'_, AppState>,
) -> AppResult<Vec<FinanceCategory>> {
    service::list_categories(&state.db)
}

#[tauri::command]
pub async fn create_finance_category(
    state: State<'_, AppState>,
    input: CategoryInput,
) -> AppResult<FinanceCategory> {
    service::create_category(&state.db, input)
}

#[tauri::command]
pub async fn update_finance_category(
    state: State<'_, AppState>,
    id: i64,
    input: CategoryUpdate,
) -> AppResult<FinanceCategory> {
    service::update_category(&state.db, id, input)
}

/// Exclusão definitiva da categoria (destrutiva, auditada); os lançamentos
/// ficam sem categoria. A interface pede confirmação antes.
#[tauri::command]
pub async fn delete_finance_category(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    service::delete_category(&state.db, id)
}

/// Lançamentos de `from` a `to` (`aaaa-mm-dd`, inclusive, até um ano; somente leitura).
#[tauri::command]
pub async fn list_transactions(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> AppResult<Vec<Transaction>> {
    service::list_transactions(&state.db, &from, &to)
}

/// Tags em uso pelos lançamentos (somente leitura).
#[tauri::command]
pub async fn list_transaction_tags(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    service::list_tags(&state.db)
}

#[tauri::command]
pub async fn create_transaction(
    state: State<'_, AppState>,
    input: TransactionInput,
) -> AppResult<Transaction> {
    service::create_transaction(&state.db, input)
}

#[tauri::command]
pub async fn update_transaction(
    state: State<'_, AppState>,
    id: i64,
    input: TransactionInput,
) -> AppResult<Transaction> {
    service::update_transaction(&state.db, id, input)
}

/// Marca o lançamento como pago/recebido ou pendente.
#[tauri::command]
pub async fn set_transaction_status(
    state: State<'_, AppState>,
    id: i64,
    status: TransactionStatus,
) -> AppResult<Transaction> {
    service::set_transaction_status(&state.db, id, status)
}

/// Exclusão definitiva (destrutiva, auditada). A interface pede confirmação antes.
#[tauri::command]
pub async fn delete_transaction(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    service::delete_transaction(&state.db, id)
}

/// Totais do mês (`aaaa-mm`), histórico dos últimos 6 meses e despesas por
/// categoria (somente leitura).
#[tauri::command]
pub async fn get_finance_overview(
    state: State<'_, AppState>,
    month: String,
) -> AppResult<FinanceOverview> {
    service::get_overview(&state.db, &month)
}

/// Receita x despesas, categorias e patrimônio mês a mês de `from` a `to`
/// (`aaaa-mm`, até 36 meses; somente leitura).
#[tauri::command]
pub async fn get_finance_analytics(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> AppResult<FinanceAnalytics> {
    analytics::analytics(&state.db, &from, &to)
}

/// Lê um extrato (OFX) ou fatura do C6 (CSV) enviado pela tela e devolve a
/// prévia: linhas, duplicados e sugestões. Não grava lançamentos.
#[tauri::command]
pub async fn preview_finance_import(
    state: State<'_, AppState>,
    file_name: String,
    content: String,
) -> AppResult<ImportPreview> {
    import::preview(&state.db, &state.import_previews, &file_name, &content)
}

/// Importa as linhas escolhidas da última prévia (auditado). A tela manda só
/// as escolhas; valores e datas vêm da leitura guardada no Rust.
#[tauri::command]
pub async fn commit_finance_import(
    state: State<'_, AppState>,
    input: ImportCommitInput,
) -> AppResult<ImportResult> {
    import::commit(&state.db, &state.import_previews, input)
}

/// Recorrentes com os vencimentos de `from` a `to` (até um ano), os atrasados
/// de antes e os resumos (somente leitura).
#[tauri::command]
pub async fn list_recurring(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> AppResult<RecurringOverview> {
    recurring::list(&state.db, &from, &to)
}

#[tauri::command]
pub async fn create_recurring(
    state: State<'_, AppState>,
    input: RecurringInput,
) -> AppResult<RecurringSeriesView> {
    recurring::create(&state.db, input)
}

#[tauri::command]
pub async fn update_recurring(
    state: State<'_, AppState>,
    id: i64,
    input: RecurringInput,
) -> AppResult<RecurringSeriesView> {
    recurring::update(&state.db, id, input)
}

/// Exclusão definitiva da recorrente (destrutiva, auditada); os lançamentos
/// vinculados continuam. A interface pede confirmação antes.
#[tauri::command]
pub async fn delete_recurring(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    recurring::delete(&state.db, id)
}

/// Cria o lançamento de um vencimento em aberto e o vincula.
#[tauri::command]
pub async fn register_recurring_occurrence(
    state: State<'_, AppState>,
    id: i64,
    occurrence_date: String,
    input: TransactionInput,
) -> AppResult<Transaction> {
    recurring::register_occurrence(&state.db, id, &occurrence_date, input)
}

/// Vincula um vencimento em aberto a um lançamento existente.
#[tauri::command]
pub async fn link_recurring_occurrence(
    state: State<'_, AppState>,
    id: i64,
    occurrence_date: String,
    transaction_id: i64,
) -> AppResult<()> {
    recurring::link_occurrence(&state.db, id, &occurrence_date, transaction_id)
}

/// Pula um vencimento em aberto (não haverá lançamento para ele).
#[tauri::command]
pub async fn skip_recurring_occurrence(
    state: State<'_, AppState>,
    id: i64,
    occurrence_date: String,
) -> AppResult<()> {
    recurring::skip_occurrence(&state.db, id, &occurrence_date)
}

/// Desfaz o vínculo ou o pulo de um vencimento; o lançamento continua.
#[tauri::command]
pub async fn reopen_recurring_occurrence(
    state: State<'_, AppState>,
    id: i64,
    occurrence_date: String,
) -> AppResult<()> {
    recurring::reopen_occurrence(&state.db, id, &occurrence_date)
}

/// Compras parceladas e o compromisso das faturas dos próximos 12 meses
/// (parcelas + recorrentes no cartão). Somente leitura.
#[tauri::command]
pub async fn get_installments_overview(
    state: State<'_, AppState>,
) -> AppResult<InstallmentsOverview> {
    installments::overview(&state.db)
}
