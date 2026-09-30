import { firstDayOf } from "@/features/finance/domain/period";
import {
  type CommitmentMonth,
  type InstallmentPurchase,
  type YearMonth,
} from "@/features/finance/types";
import { formatMonthShort, formatMonthYear } from "@/lib/format";
import { type IsoDate } from "@/types/common";

/**
 * Parcelamentos: rótulos e derivações de exibição. O agrupamento, a projeção
 * das parcelas e o compromisso mensal vêm prontos do Rust
 * (`domain/finance/installments.rs`).
 */

/** "out" (eixo do gráfico). */
export function monthShortLabel(month: YearMonth): string {
  return formatMonthShort(firstDayOf(month));
}

/** "outubro de 2026". */
export function monthLongLabel(month: YearMonth): string {
  return formatMonthYear(firstDayOf(month));
}

/** Parcelas + recorrentes no cartão do mês. */
export function commitmentTotal(
  month: Pick<CommitmentMonth, "installments" | "recurring">,
): number {
  return month.installments + month.recurring;
}

/** Fração paga (0–1) de uma compra. */
export function paidFraction(purchase: Pick<InstallmentPurchase, "paid" | "count">): number {
  return purchase.count === 0 ? 0 : purchase.paid / purchase.count;
}

/** "4/10" (a parcela que vence agora) ou "10/10" quando terminou. */
export function installmentLabel(purchase: Pick<InstallmentPurchase, "current" | "count">): string {
  return `${purchase.current ?? purchase.count}/${purchase.count}`;
}

/** Meses do mês de `today` até `month` (0 = o próprio mês). */
export function monthsUntil(month: YearMonth, today: IsoDate): number {
  const [year, monthIndex] = month.split("-").map(Number);
  const [todayYear, todayMonth] = today.split("-").map(Number);
  return ((year ?? 0) - (todayYear ?? 0)) * 12 + ((monthIndex ?? 0) - (todayMonth ?? 0));
}

/** "em 7 meses", "no mês que vem", "neste mês". */
export function relativeMonths(months: number): string {
  if (months <= 0) return "neste mês";
  if (months === 1) return "no mês que vem";
  return `em ${months} meses`;
}

/** Descrições das compras que terminam no mês (na ordem da lista). */
export function endingDescriptions(
  month: Pick<CommitmentMonth, "ending">,
  purchases: readonly InstallmentPurchase[],
): string[] {
  const ending = new Set(month.ending);
  return purchases.filter((purchase) => ending.has(purchase.id)).map((p) => p.description);
}

/**
 * Quanto a fatura cai em relação ao mês anterior (positivo = alivia). `null`
 * no primeiro mês.
 */
export function reliefFromPrevious(
  months: readonly CommitmentMonth[],
  index: number,
): number | null {
  const previous = months[index - 1];
  const current = months[index];
  if (!previous || !current) return null;
  return commitmentTotal(previous) - commitmentTotal(current);
}
