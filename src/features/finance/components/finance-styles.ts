import { type TransactionKind } from "@/features/finance/types";

/** Cor do valor: entradas em verde, saídas no tom padrão (o sinal já diz). */
export const amountToneClass: Record<TransactionKind, string> = {
  income: "text-success",
  expense: "text-foreground",
  transfer: "text-muted-foreground",
};

/** Sinal exibido antes do valor. */
export const amountSign: Record<TransactionKind, string> = {
  income: "+",
  expense: "−",
  transfer: "⇄",
};

/** Cor de um saldo/resultado: negativo em vermelho. */
export function balanceToneClass(cents: number): string {
  return cents < 0 ? "text-danger" : "text-foreground";
}

/** Resultado de investimento: ganho em verde, perda em vermelho. */
export function gainToneClass(cents: number): string {
  if (cents > 0) return "text-success";
  return cents < 0 ? "text-danger" : "text-muted-foreground";
}

export { categoryBadgeClass, categoryDotClass } from "@/lib/palette";
