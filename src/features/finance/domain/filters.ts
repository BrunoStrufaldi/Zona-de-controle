import { parseAmount } from "@/features/finance/domain/money";
import {
  type FinanceAccount,
  type FinanceCategory,
  type Transaction,
  type TransactionKind,
  type TransactionStatus,
} from "@/features/finance/types";
import { matchesSearch } from "@/lib/text";

/** Filtro por categoria: todas, sem categoria ou uma categoria (id). */
export type CategoryFilter = "all" | "none" | number;

export interface TransactionFilters {
  search: string;
  kind: TransactionKind | "all";
  status: TransactionStatus | "all";
  category: CategoryFilter;
  accountId: number | "all";
  /** Faixa de valor como digitada (inclusiva); vazio ou inválido = sem limite. */
  minAmount: string;
  maxAmount: string;
}

export const DEFAULT_TRANSACTION_FILTERS: TransactionFilters = {
  search: "",
  kind: "all",
  status: "all",
  category: "all",
  accountId: "all",
  minAmount: "",
  maxAmount: "",
};

export function hasActiveFilters(filters: TransactionFilters): boolean {
  return (Object.keys(DEFAULT_TRANSACTION_FILTERS) as (keyof TransactionFilters)[]).some(
    (key) => filters[key] !== DEFAULT_TRANSACTION_FILTERS[key],
  );
}

export interface FilterContext {
  categories: ReadonlyMap<number, FinanceCategory>;
  accounts: ReadonlyMap<number, FinanceAccount>;
}

/**
 * Aplica os filtros. A busca ignora acentos e caixa e procura na descrição,
 * nas observações, nas tags, na categoria e na conta.
 */
export function filterTransactions(
  transactions: readonly Transaction[],
  filters: TransactionFilters,
  context: FilterContext,
): Transaction[] {
  const minAmount = parseAmount(filters.minAmount);
  const maxAmount = parseAmount(filters.maxAmount);
  return transactions.filter((transaction) => {
    if (filters.kind !== "all" && transaction.kind !== filters.kind) return false;
    if (filters.status !== "all" && transaction.status !== filters.status) return false;
    // A transferência aparece nas duas contas.
    if (
      filters.accountId !== "all" &&
      transaction.accountId !== filters.accountId &&
      transaction.transferAccountId !== filters.accountId
    )
      return false;
    // "Sem categoria" é para entradas e saídas (transferência nunca tem categoria).
    if (
      filters.category === "none" &&
      (transaction.categoryId !== null || transaction.kind === "transfer")
    )
      return false;
    if (typeof filters.category === "number" && transaction.categoryId !== filters.category)
      return false;
    if (minAmount !== null && transaction.amount < minAmount) return false;
    if (maxAmount !== null && transaction.amount > maxAmount) return false;

    const category =
      transaction.categoryId === null ? undefined : context.categories.get(transaction.categoryId);
    return matchesSearch(
      [
        transaction.description,
        transaction.notes,
        ...transaction.tags,
        category?.name ?? "",
        context.accounts.get(transaction.accountId)?.name ?? "",
        transaction.transferAccountId === null
          ? ""
          : (context.accounts.get(transaction.transferAccountId)?.name ?? ""),
      ],
      filters.search,
    );
  });
}

export function indexById<T extends { id: number }>(items: readonly T[]): ReadonlyMap<number, T> {
  return new Map(items.map((item) => [item.id, item]));
}
