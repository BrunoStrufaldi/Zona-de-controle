import {
  type AccountKind,
  type TransactionKind,
  type TransactionStatus,
} from "@/features/finance/types";

export const accountKindLabels: Record<AccountKind, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  credit_card: "Cartão de crédito",
  cash: "Dinheiro",
  investment: "Investimentos",
  other: "Outra",
};

export const transactionKindLabels: Record<TransactionKind, string> = {
  income: "Entrada",
  expense: "Saída",
  transfer: "Transferência",
};

/** Rótulo do status conforme o tipo: "Pago" (saída), "Recebido" (entrada) ou "Feita" (transferência). */
export function statusLabel(kind: TransactionKind, status: TransactionStatus): string {
  if (status === "pending") return "Pendente";
  if (kind === "transfer") return "Feita";
  return kind === "income" ? "Recebido" : "Pago";
}

/** Nome da categoria para exibição (`null` = sem categoria). */
export const NO_CATEGORY_LABEL = "Sem categoria";
