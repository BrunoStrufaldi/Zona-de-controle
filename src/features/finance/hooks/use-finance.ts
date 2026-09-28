import { useCallback, useMemo } from "react";

import { type DateRange } from "@/features/finance/domain/period";
import {
  type AccountInput,
  type CategoryInput,
  type CategoryUpdate,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceOverview,
  type ImportCommitInput,
  type ImportPreview,
  type ImportResult,
  type Transaction,
  type TransactionInput,
  type TransactionStatus,
  type YearMonth,
} from "@/features/finance/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { type Mutate, useMutableResource } from "@/hooks/use-mutable-resource";
import {
  commitFinanceImport,
  createFinanceAccount,
  createFinanceCategory,
  createTransaction,
  deleteFinanceAccount,
  deleteFinanceCategory,
  deleteTransaction,
  getFinanceOverview,
  previewFinanceImport,
  listFinanceAccounts,
  listFinanceCategories,
  listTransactionTags,
  listTransactions,
  setTransactionStatus,
  updateFinanceAccount,
  updateFinanceCategory,
  updateTransaction,
} from "@/services/finance-service";

/** Cadastros usados por todas as telas de Finanças. */
interface FinanceRegistry {
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

function registryActions<T extends FinanceRegistry>(mutate: Mutate<T>): RegistryActions {
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
