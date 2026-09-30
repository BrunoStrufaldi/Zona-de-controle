import { useCallback, useMemo } from "react";

import { type MonthSpan } from "@/features/finance/domain/analytics";
import { type DateRange } from "@/features/finance/domain/period";
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
import { type AsyncResource, useAsyncResource } from "@/hooks/use-async-resource";
import { type Mutate, useMutableResource } from "@/hooks/use-mutable-resource";
import {
  commitFinanceImport,
  createFinanceAccount,
  createFinanceCategory,
  createRecurring,
  createTransaction,
  deleteFinanceAccount,
  deleteFinanceCategory,
  deleteRecurring,
  deleteTransaction,
  getFinanceAnalytics,
  getFinanceOverview,
  getInstallmentsOverview,
  linkRecurringOccurrence,
  previewFinanceImport,
  listFinanceAccounts,
  listFinanceCategories,
  listRecurring,
  listTransactionTags,
  listTransactions,
  registerRecurringOccurrence,
  reopenRecurringOccurrence,
  setTransactionStatus,
  skipRecurringOccurrence,
  updateFinanceAccount,
  updateFinanceCategory,
  updateRecurring,
  updateTransaction,
} from "@/services/finance-service";

/** Cadastros usados por todas as telas de Finanças. */
export interface FinanceRegistry {
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
}

export interface RegistryActions {
  /** Cria (`id` nulo) ou edita uma conta. */
  saveAccount: (id: number | null, input: AccountInput) => Promise<FinanceAccount>;
  /** Exclusão definitiva — chame apenas após confirmação do usuário. */
  removeAccount: (id: number) => Promise<void>;
  createCategory: (input: CategoryInput) => Promise<FinanceCategory>;
  updateCategory: (id: number, input: CategoryUpdate) => Promise<FinanceCategory>;
  /** Exclusão definitiva — chame apenas após confirmação do usuário. */
  removeCategory: (id: number) => Promise<void>;
}

export function registryActions<T extends FinanceRegistry>(mutate: Mutate<T>): RegistryActions {
  return {
    saveAccount: (id, input) =>
      mutate(null, () =>
        id === null ? createFinanceAccount(input) : updateFinanceAccount(id, input),
      ),
    removeAccount: (id) =>
      mutate(
        (data) => ({ ...data, accounts: data.accounts.filter((account) => account.id !== id) }),
        () => deleteFinanceAccount(id),
      ),
    createCategory: (input) => mutate(null, () => createFinanceCategory(input)),
    updateCategory: (id, input) => mutate(null, () => updateFinanceCategory(id, input)),
    removeCategory: (id) =>
      mutate(
        (data) => ({
          ...data,
          categories: data.categories.filter((category) => category.id !== id),
        }),
        () => deleteFinanceCategory(id),
      ),
  };
}

// ---------------------------------------------------------------- Lançamentos

export interface TransactionsData extends FinanceRegistry {
  transactions: Transaction[];
  /** Tags em uso (sugestões do formulário). */
  tags: string[];
}

export interface TransactionsActions extends RegistryActions {
  create: (input: TransactionInput) => Promise<Transaction>;
  update: (id: number, input: TransactionInput) => Promise<Transaction>;
  setStatus: (id: number, status: TransactionStatus) => Promise<Transaction>;
  /** Exclusão definitiva — chame apenas após confirmação do usuário. */
  remove: (id: number) => Promise<void>;
  /** Lê um extrato e devolve a prévia (nada é gravado). */
  previewImport: (fileName: string, content: string) => Promise<ImportPreview>;
  /** Importa as linhas escolhidas da prévia de um extrato. */
  importStatement: (input: ImportCommitInput) => Promise<ImportResult>;
}

const withTransactions =
  (update: (transactions: Transaction[]) => Transaction[]) =>
  (data: TransactionsData): TransactionsData => ({
    ...data,
    transactions: update(data.transactions),
  });

/**
 * Lançamentos do período com contas, categorias e tags. Status e exclusão
 * aparecem na tela na hora (otimista); após cada operação tudo é recarregado.
 */
export function useTransactions(range: DateRange): {
  resource: AsyncResource<TransactionsData>;
  actions: TransactionsActions;
} {
  const { from, to } = range;
  const load = useCallback(
    () =>
      Promise.all([
        listTransactions(from, to),
        listFinanceAccounts(),
        listFinanceCategories(),
        listTransactionTags(),
      ]).then(([transactions, accounts, categories, tags]) => ({
        transactions,
        accounts,
        categories,
        tags,
      })),
    [from, to],
  );
  const { resource, mutate } = useMutableResource(load);

  const actions = useMemo<TransactionsActions>(
    () => ({
      ...registryActions(mutate),
      create: (input) => mutate(null, () => createTransaction(input)),
      update: (id, input) => mutate(null, () => updateTransaction(id, input)),
      setStatus: (id, status) =>
        mutate(
          withTransactions((transactions) =>
            transactions.map((transaction) =>
              transaction.id === id ? { ...transaction, status } : transaction,
            ),
          ),
          () => setTransactionStatus(id, status),
        ),
      remove: (id) =>
        mutate(
          withTransactions((transactions) =>
            transactions.filter((transaction) => transaction.id !== id),
          ),
          () => deleteTransaction(id),
        ),
      previewImport: previewFinanceImport,
      importStatement: (input) => mutate(null, () => commitFinanceImport(input)),
    }),
    [mutate],
  );

  return { resource, actions };
}

// ---------------------------------------------------------------- Visão Geral

export interface OverviewData extends FinanceRegistry {
  overview: FinanceOverview;
}

/** Resumo do mês com contas e categorias (para nomes, cores e saldos). */
export function useFinanceOverview(month: YearMonth): {
  resource: AsyncResource<OverviewData>;
  actions: RegistryActions;
} {
  const load = useCallback(
    () =>
      Promise.all([getFinanceOverview(month), listFinanceAccounts(), listFinanceCategories()]).then(
        ([overview, accounts, categories]) => ({ overview, accounts, categories }),
      ),
    [month],
  );
  const { resource, mutate } = useMutableResource(load);
  const actions = useMemo(() => registryActions(mutate), [mutate]);
  return { resource, actions };
}

// ---------------------------------------------------------------- Analytics

export interface AnalyticsData {
  analytics: FinanceAnalytics;
  categories: FinanceCategory[];
}

/** Histórico dos meses `from` a `to` com as categorias (nomes e cores); somente leitura. */
export function useFinanceAnalytics(span: MonthSpan): AsyncResource<AnalyticsData> {
  const { from, to } = span;
  const load = useCallback(
    () =>
      Promise.all([getFinanceAnalytics(from, to), listFinanceCategories()]).then(
        ([analytics, categories]) => ({ analytics, categories }),
      ),
    [from, to],
  );
  return useAsyncResource(load);
}

// ---------------------------------------------------------------- Recorrentes

export interface RecurringData extends FinanceRegistry {
  recurring: RecurringOverview;
  /** Tags em uso (sugestões do formulário de lançamento). */
  tags: string[];
}

export interface RecurringActions {
  /** Cria (`id` nulo) ou edita uma recorrente. */
  save: (id: number | null, input: RecurringInput) => Promise<RecurringSeries>;
  /** Exclusão definitiva — chame apenas após confirmação do usuário. */
  remove: (id: number) => Promise<void>;
  /** Cria o lançamento do vencimento e o vincula. */
  register: (occurrence: OccurrenceRef, input: TransactionInput) => Promise<Transaction>;
  link: (occurrence: OccurrenceRef, transactionId: number) => Promise<void>;
  skip: (occurrence: OccurrenceRef) => Promise<void>;
  /** Desfaz o vínculo ou o pulo (o lançamento continua). */
  reopen: (occurrence: OccurrenceRef) => Promise<void>;
  /** Marca o lançamento vinculado como pago/recebido ou pendente. */
  setTransactionStatus: (id: number, status: TransactionStatus) => Promise<Transaction>;
  /** Lançamentos de um intervalo (para escolher qual vincular). */
  loadTransactions: (range: DateRange) => Promise<Transaction[]>;
}

/** Recorrentes com os vencimentos do período, contas e categorias. Tudo é recarregado após cada operação. */
export function useRecurring(range: DateRange): {
  resource: AsyncResource<RecurringData>;
  actions: RecurringActions;
} {
  const { from, to } = range;
  const load = useCallback(
    () =>
      Promise.all([
        listRecurring(from, to),
        listFinanceAccounts(),
        listFinanceCategories(),
        listTransactionTags(),
      ]).then(([recurring, accounts, categories, tags]) => ({
        recurring,
        accounts,
        categories,
        tags,
      })),
    [from, to],
  );
  const { resource, mutate } = useMutableResource(load);

  const actions = useMemo<RecurringActions>(
    () => ({
      save: (id, input) =>
        mutate(null, () => (id === null ? createRecurring(input) : updateRecurring(id, input))),
      remove: (id) =>
        mutate(
          (data) => ({
            ...data,
            recurring: {
              ...data.recurring,
              series: data.recurring.series.filter((series) => series.id !== id),
            },
          }),
          () => deleteRecurring(id),
        ),
      register: (occurrence, input) =>
        mutate(null, () => registerRecurringOccurrence(occurrence, input)),
      link: (occurrence, transactionId) =>
        mutate(null, () => linkRecurringOccurrence(occurrence, transactionId)),
      skip: (occurrence) => mutate(null, () => skipRecurringOccurrence(occurrence)),
      reopen: (occurrence) => mutate(null, () => reopenRecurringOccurrence(occurrence)),
      setTransactionStatus: (id, status) => mutate(null, () => setTransactionStatus(id, status)),
      loadTransactions: (window) => listTransactions(window.from, window.to),
    }),
    [mutate],
  );

  return { resource, actions };
}

// ---------------------------------------------------------------- Parcelamentos

export interface InstallmentsData extends FinanceRegistry {
  installments: InstallmentsOverview;
}

function loadInstallments(): Promise<InstallmentsData> {
  return Promise.all([
    getInstallmentsOverview(),
    listFinanceAccounts(),
    listFinanceCategories(),
  ]).then(([installments, accounts, categories]) => ({ installments, accounts, categories }));
}

/** Parcelamentos com contas e categorias (somente leitura). */
export function useInstallments(): AsyncResource<InstallmentsData> {
  return useAsyncResource(loadInstallments);
}
