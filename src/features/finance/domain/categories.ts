import {
  CATEGORY_COLORS,
  type CategoryColor,
  type CategoryTotal,
  type Cents,
  type FinanceCategory,
  type TransactionKind,
} from "@/features/finance/types";
import { NO_CATEGORY_LABEL } from "@/features/finance/domain/labels";

/** Limites espelhados de `src-tauri/src/domain/finance/{categories,accounts}.rs`. */
export const CATEGORY_LIMITS = { nameChars: 40, categories: 100 } as const;
export const ACCOUNT_LIMITS = { nameChars: 40, accounts: 20 } as const;

/** Nome normalizado como no backend: espaços colapsados nas pontas e no meio. */
export function normalizeName(name: string): string {
  return name.trim().split(/\s+/).join(" ");
}

/**
 * Valida um nome (categoria ou conta) para feedback imediato. `existing` são os
 * nomes já usados no mesmo grupo (ex.: categorias do mesmo tipo), com o id.
 * Retorna a mensagem de erro ou `null`.
 */
export function validateName(
  rawName: string,
  existing: readonly { id: number; name: string }[],
  editingId: number | null,
  maxChars: number,
  duplicateMessage: (name: string) => string,
): string | null {
  const name = normalizeName(rawName);
  if (name === "") return "Informe um nome.";
  if (name.length > maxChars) return `Use no máximo ${maxChars} caracteres.`;
  const clash = existing.some(
    (item) => item.id !== editingId && item.name.toLowerCase() === name.toLowerCase(),
  );
  return clash ? duplicateMessage(name) : null;
}

/** Primeira cor ainda não usada (ou a próxima da paleta, em ciclo). */
export function suggestColor(used: readonly { color: CategoryColor }[]): CategoryColor {
  const taken = new Set(used.map((item) => item.color));
  return (
    CATEGORY_COLORS.find((color) => !taken.has(color)) ??
    CATEGORY_COLORS[used.length % CATEGORY_COLORS.length] ??
    "blue"
  );
}

export function categoriesOfKind(
  categories: readonly FinanceCategory[],
  kind: TransactionKind,
): FinanceCategory[] {
  return categories.filter((category) => category.kind === kind);
}

export interface CategoryShare {
  /** `null` = sem categoria. */
  id: number | null;
  name: string;
  color: CategoryColor | null;
  total: Cents;
  /** Fração do total de despesas (0–1). */
  share: number;
}

/** Despesas por categoria com nome, cor e participação no total. */
export function categoryShares(
  totals: readonly CategoryTotal[],
  categories: ReadonlyMap<number, FinanceCategory>,
): CategoryShare[] {
  const sum = totals.reduce((acc, item) => acc + item.total, 0);
  return totals.map(({ categoryId, total }) => {
    const category = categoryId === null ? undefined : categories.get(categoryId);
    return {
      id: categoryId,
      name: category?.name ?? NO_CATEGORY_LABEL,
      color: category?.color ?? null,
      total,
      share: sum > 0 ? total / sum : 0,
    };
  });
}
