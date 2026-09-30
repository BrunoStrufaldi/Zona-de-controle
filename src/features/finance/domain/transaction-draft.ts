import { MAX_AMOUNT_CENTS, parseAmount, toAmountInput } from "@/features/finance/domain/money";
import {
  type FinanceCategory,
  type Transaction,
  type TransactionInput,
  type TransactionKind,
  type TransactionStatus,
} from "@/features/finance/types";
import { TAG_LIMITS } from "@/lib/tags";
import { type IsoDate } from "@/types/common";

/** Limites espelhados de `src-tauri/src/domain/finance/transactions.rs`. */
export const TRANSACTION_LIMITS = {
  descriptionChars: 120,
  notesChars: 2_000,
  tags: TAG_LIMITS.tags,
  tagChars: TAG_LIMITS.tagChars,
} as const;

/** Estado do formulário: o valor é o texto digitado, convertido ao salvar. */
export interface TransactionDraft {
  accountId: number | null;
  /** Só na transferência: conta de destino. */
  transferAccountId: number | null;
  categoryId: number | null;
  kind: TransactionKind;
  description: string;
  amountText: string;
  date: IsoDate;
  status: TransactionStatus;
  notes: string;
  tags: string[];
}

export type TransactionDraftErrors = Partial<Record<keyof TransactionDraft, string>>;

export function emptyTransactionDraft(
  accountId: number | null,
  date: IsoDate,
  kind: TransactionKind = "expense",
): TransactionDraft {
  return {
    accountId,
    transferAccountId: null,
    categoryId: null,
    kind,
    description: "",
    amountText: "",
    date,
    status: "paid",
    notes: "",
    tags: [],
  };
}

export function toTransactionDraft(transaction: Transaction): TransactionDraft {
  return {
    accountId: transaction.accountId,
    transferAccountId: transaction.transferAccountId,
    categoryId: transaction.categoryId,
    kind: transaction.kind,
    description: transaction.description,
    amountText: toAmountInput(transaction.amount),
    date: transaction.date,
    status: transaction.status,
    notes: transaction.notes,
    tags: [...transaction.tags],
  };
}

/**
 * Troca o tipo do lançamento. A categoria é de um tipo só, então é limpa se
 * não combinar com o novo tipo (transferência não tem categoria).
 */
export function changeKind<T extends { kind: TransactionKind; categoryId: number | null }>(
  draft: T,
  kind: TransactionKind,
  categories: ReadonlyMap<number, FinanceCategory>,
): T {
  const category = draft.categoryId === null ? undefined : categories.get(draft.categoryId);
  return { ...draft, kind, categoryId: category?.kind === kind ? draft.categoryId : null };
}

/**
 * Valida o formulário para feedback imediato. Retorna os erros e, quando
 * válido, a entrada pronta para o backend (que valida de novo).
 */
export function validateTransactionDraft(draft: TransactionDraft): {
  errors: TransactionDraftErrors;
  input: TransactionInput | null;
} {
  const errors: TransactionDraftErrors = {};
  const description = draft.description.trim();
  if (description === "") errors.description = "Informe uma descrição.";
  else if (description.length > TRANSACTION_LIMITS.descriptionChars)
    errors.description = `Use no máximo ${TRANSACTION_LIMITS.descriptionChars} caracteres.`;

  const amount = parseAmount(draft.amountText);
  if (draft.amountText.trim() === "") errors.amountText = "Informe o valor.";
  else if (amount === null) errors.amountText = "Valor inválido. Use o formato 1.234,56.";
  else if (amount <= 0) errors.amountText = "O valor precisa ser maior que zero.";
  else if (amount > MAX_AMOUNT_CENTS) errors.amountText = "Valor acima do limite aceito.";

  if (draft.accountId === null) errors.accountId = "Escolha a conta.";
  if (draft.kind === "transfer") {
    if (draft.transferAccountId === null) errors.transferAccountId = "Escolha a conta de destino.";
    else if (draft.transferAccountId === draft.accountId)
      errors.transferAccountId = "Escolha uma conta diferente da de origem.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) errors.date = "Informe a data.";

  const notes = draft.notes.trim();
  if (notes.length > TRANSACTION_LIMITS.notesChars)
    errors.notes = `Use no máximo ${TRANSACTION_LIMITS.notesChars} caracteres.`;

  if (draft.tags.length > TRANSACTION_LIMITS.tags)
    errors.tags = `Use no máximo ${TRANSACTION_LIMITS.tags} tags.`;
  else if (draft.tags.some((tag) => tag.length > TRANSACTION_LIMITS.tagChars))
    errors.tags = `Cada tag pode ter no máximo ${TRANSACTION_LIMITS.tagChars} caracteres.`;

  if (Object.keys(errors).length > 0 || amount === null || draft.accountId === null) {
    return { errors, input: null };
  }
  return {
    errors,
    input: {
      accountId: draft.accountId,
      transferAccountId: draft.kind === "transfer" ? draft.transferAccountId : null,
      categoryId: draft.kind === "transfer" ? null : draft.categoryId,
      kind: draft.kind,
      description,
      amount,
      date: draft.date,
      status: draft.status,
      notes,
      tags: draft.tags,
    },
  };
}
