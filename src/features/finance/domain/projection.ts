import { firstDayOf } from "@/features/finance/domain/period";
import {
  type Cents,
  type FinanceProjection,
  type ProjectedFlows,
  type ProjectionMonth,
  type YearMonth,
} from "@/features/finance/types";
import { formatMonthShort, formatMonthYear } from "@/lib/format";

/** O que já se sabe que vai entrar ou sair (sem a estimativa). */
export function knownFlows(flows: ProjectedFlows): Cents {
  return flows.recurring + flows.installments + flows.scheduled;
}

/** Entradas − saídas estimadas do mês (pode ser negativo). */
export function estimatedNet(month: ProjectionMonth): Cents {
  return month.income.estimated - month.expenses.estimated;
}

/** Ponto do gráfico: hoje e o fim de cada mês. */
export interface ProjectionPoint {
  /** `"today"` ou `aaaa-mm`. */
  key: string;
  balance: Cents;
  balanceKnown: Cents;
}

export const TODAY_KEY = "today";

export function projectionPoints(projection: FinanceProjection): ProjectionPoint[] {
  return [
    {
      key: TODAY_KEY,
      balance: projection.startBalance,
      balanceKnown: projection.startBalance,
    },
    ...projection.months.map((month) => ({
      key: month.month,
      balance: month.balance,
      balanceKnown: month.balanceKnown,
    })),
  ];
}

/** Eixo: "hoje", "set", "out"… */
export function pointTick(key: string): string {
  return key === TODAY_KEY ? "hoje" : formatMonthShort(firstDayOf(key));
}

/** Dica e tabela: "Hoje" ou "fim de setembro de 2026". */
export function pointName(key: string): string {
  return key === TODAY_KEY ? "Hoje" : `fim de ${formatMonthYear(firstDayOf(key))}`;
}

/** Mês com o menor saldo previsto (com a estimativa). */
export function lowestBalance(months: readonly ProjectionMonth[]): ProjectionMonth | null {
  return months.reduce<ProjectionMonth | null>(
    (lowest, month) => (lowest === null || month.balance < lowest.balance ? month : lowest),
    null,
  );
}

/** Soma das parcelas no horizonte da projeção. */
export function installmentsTotal(months: readonly ProjectionMonth[]): Cents {
  return months.reduce((sum, month) => sum + month.expenses.installments, 0);
}

export interface InstallmentsRelief {
  month: YearMonth;
  /** Quanto a menos em parcelas que no mês anterior. */
  amount: Cents;
}

/** Meses em que as parcelas diminuem (compras terminando). */
export function installmentsReliefs(months: readonly ProjectionMonth[]): InstallmentsRelief[] {
  return months.flatMap((month, index) => {
    const previous = months[index - 1];
    if (previous === undefined) return [];
    const amount = previous.expenses.installments - month.expenses.installments;
    return amount > 0 ? [{ month: month.month, amount }] : [];
  });
}
