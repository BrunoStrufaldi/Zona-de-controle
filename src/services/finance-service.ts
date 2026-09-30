import {
  type AccountInput,
  type CategoryInput,
  type CategoryUpdate,
  type FinanceAccount,
  type FinanceAnalytics,
  type FinanceCategory,
  type FinanceOverview,
  type ImportCommitInput,
  type ImportPreview,
  type ImportResult,
  type InstallmentsOverview,
  type OccurrenceRef,
  type RecurringInput,
  type RecurringOverview,
  type RecurringSeries,
  type Transaction,
  type TransactionInput,
  type TransactionStatus,
  type YearMonth,
} from "@/features/finance/types";
import { invokeCommand } from "@/services/tauri/commands";
import { type IsoDate } from "@/types/common";

/** Contas com saldo (só lançamentos pagos) e quantidade de lançamentos. */
export function listFinanceAccounts(): Promise<FinanceAccount[]> {
  return invokeCommand("list_finance_accounts");
}

export function createFinanceAccount(input: AccountInput): Promise<FinanceAccount> {
  return invokeCommand("create_finance_account", { input });
}

export function updateFinanceAccount(id: number, input: AccountInput): Promise<FinanceAccount> {
  return invokeCommand("update_finance_account", { id, input });
}

/**
 * Exclusão definitiva e auditada de uma conta sem lançamentos. Só chame após
 * confirmação explícita do usuário.
 */
export async function deleteFinanceAccount(id: number): Promise<void> {
  await invokeCommand("delete_finance_account", { id });
}

export function listFinanceCategories(): Promise<FinanceCategory[]> {
  return invokeCommand("list_finance_categories");
}

export function createFinanceCategory(input: CategoryInput): Promise<FinanceCategory> {
  return invokeCommand("create_finance_category", { input });
}

export function updateFinanceCategory(id: number, input: CategoryUpdate): Promise<FinanceCategory> {
  return invokeCommand("update_finance_category", { id, input });
}

/**
 * Exclusão definitiva e auditada da categoria (os lançamentos ficam sem
 * categoria). Só chame após confirmação explícita do usuário.
 */
export async function deleteFinanceCategory(id: number): Promise<void> {
  await invokeCommand("delete_finance_category", { id });
}

/** Lançamentos de `from` a `to` (inclusive, até um ano), dos mais recentes aos mais antigos. */
export function listTransactions(from: IsoDate, to: IsoDate): Promise<Transaction[]> {
  return invokeCommand("list_transactions", { from, to });
}

/** Tags em uso por algum lançamento (sugestões do formulário). */
export function listTransactionTags(): Promise<string[]> {
  return invokeCommand("list_transaction_tags");
}

export function createTransaction(input: TransactionInput): Promise<Transaction> {
  return invokeCommand("create_transaction", { input });
}

export function updateTransaction(id: number, input: TransactionInput): Promise<Transaction> {
  return invokeCommand("update_transaction", { id, input });
}

export function setTransactionStatus(id: number, status: TransactionStatus): Promise<Transaction> {
  return invokeCommand("set_transaction_status", { id, status });
}

/**
 * Exclusão definitiva e auditada. Só chame após confirmação explícita do
 * usuário (ver `DeleteTransactionDialog`).
 */
export async function deleteTransaction(id: number): Promise<void> {
  await invokeCommand("delete_transaction", { id });
}

/** Totais do mês, histórico de 6 meses e despesas por categoria. */
export function getFinanceOverview(month: YearMonth): Promise<FinanceOverview> {
  return invokeCommand("get_finance_overview", { month });
}

/** Receita x despesas, categorias e patrimônio mês a mês de `from` a `to` (até 36 meses). */
export function getFinanceAnalytics(from: YearMonth, to: YearMonth): Promise<FinanceAnalytics> {
  return invokeCommand("get_finance_analytics", { from, to });
}

/**
 * Lê o conteúdo de um extrato (OFX) ou fatura do C6 (CSV) escolhido pelo
 * usuário e devolve a prévia. Nada é gravado.
 */
export function previewFinanceImport(fileName: string, content: string): Promise<ImportPreview> {
  return invokeCommand("preview_finance_import", { fileName, content });
}

/** Importa as linhas escolhidas da última prévia (auditado). */
export function commitFinanceImport(input: ImportCommitInput): Promise<ImportResult> {
  return invokeCommand("commit_finance_import", { input });
}

/**
 * Recorrentes com os vencimentos de `from` a `to` (até um ano), os atrasados
 * de antes e os resumos. Os vencimentos são calculados no Rust.
 */
export function listRecurring(from: IsoDate, to: IsoDate): Promise<RecurringOverview> {
  return invokeCommand("list_recurring", { from, to });
}

export function createRecurring(input: RecurringInput): Promise<RecurringSeries> {
  return invokeCommand("create_recurring", { input });
}

export function updateRecurring(id: number, input: RecurringInput): Promise<RecurringSeries> {
  return invokeCommand("update_recurring", { id, input });
}

/**
 * Exclusão definitiva e auditada da recorrente (os lançamentos vinculados
 * continuam). Só chame após confirmação explícita do usuário.
 */
export async function deleteRecurring(id: number): Promise<void> {
  await invokeCommand("delete_recurring", { id });
}

/** Cria o lançamento de um vencimento em aberto e o vincula. */
export function registerRecurringOccurrence(
  occurrence: OccurrenceRef,
  input: TransactionInput,
): Promise<Transaction> {
  return invokeCommand("register_recurring_occurrence", {
    id: occurrence.recurringId,
    occurrenceDate: occurrence.occurrenceDate,
    input,
  });
}

/** Vincula um vencimento em aberto a um lançamento que já existe. */
export async function linkRecurringOccurrence(
  occurrence: OccurrenceRef,
  transactionId: number,
): Promise<void> {
  await invokeCommand("link_recurring_occurrence", {
    id: occurrence.recurringId,
    occurrenceDate: occurrence.occurrenceDate,
    transactionId,
  });
}

/** Pula um vencimento em aberto (não haverá lançamento para ele). */
export async function skipRecurringOccurrence(occurrence: OccurrenceRef): Promise<void> {
  await invokeCommand("skip_recurring_occurrence", {
    id: occurrence.recurringId,
    occurrenceDate: occurrence.occurrenceDate,
  });
}

/** Desfaz o vínculo ou o pulo; o lançamento vinculado continua existindo. */
export async function reopenRecurringOccurrence(occurrence: OccurrenceRef): Promise<void> {
  await invokeCommand("reopen_recurring_occurrence", {
    id: occurrence.recurringId,
    occurrenceDate: occurrence.occurrenceDate,
  });
}

/**
 * Compras parceladas (das faturas importadas) e o compromisso das faturas dos
 * próximos 12 meses, calculados no Rust.
 */
export function getInstallmentsOverview(): Promise<InstallmentsOverview> {
  return invokeCommand("get_installments_overview");
}
