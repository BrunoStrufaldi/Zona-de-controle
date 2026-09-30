import { NO_CATEGORY_LABEL } from "@/features/finance/domain/labels";
import { firstDayOf, monthOf, shiftMonth } from "@/features/finance/domain/period";
import {
  type AnalyticsMonth,
  type CategoryColor,
  type CategoryTrend,
  type Cents,
  type FinanceCategory,
  type NetWorthPoint,
  type YearMonth,
} from "@/features/finance/types";
import { formatMonthShort, formatMonthYear, formatPercent } from "@/lib/format";
import { type IsoDate } from "@/types/common";

/** Meses de `from` a `to` (inclusivos), como o Rust espera. */
export interface MonthSpan {
  from: YearMonth;
  to: YearMonth;
}

/** Períodos da tela Analytics. */
export const ANALYTICS_PERIODS = ["6m", "12m", "year", "last-year"] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export const analyticsPeriodLabels: Record<AnalyticsPeriod, string> = {
  "6m": "6 meses",
  "12m": "12 meses",
  year: "Este ano",
  "last-year": "Ano passado",
};

/** Meses do período: os "N meses" terminam no mês atual. */
export function analyticsSpan(period: AnalyticsPeriod, today: IsoDate): MonthSpan {
  const current = monthOf(today);
  const year = Number(today.slice(0, 4));
  switch (period) {
    case "6m":
      return { from: shiftMonth(current, -5), to: current };
    case "12m":
      return { from: shiftMonth(current, -11), to: current };
    case "year":
      return { from: `${year}-01`, to: current };
    case "last-year":
      return { from: `${year - 1}-01`, to: `${year - 1}-12` };
  }
}

/** Quantidade de meses do período. */
export function spanLength(span: MonthSpan): number {
  const index = (month: YearMonth) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
  return index(span.to) - index(span.from) + 1;
}

/** Período de mesmo tamanho logo antes (base da comparação por categoria). */
export function previousSpan(span: MonthSpan): MonthSpan {
  const length = spanLength(span);
  return { from: shiftMonth(span.from, -length), to: shiftMonth(span.from, -1) };
}

/** "de outubro de 2025 a setembro de 2026" (ou só o mês, se for um). */
export function describeSpan(span: MonthSpan): string {
  if (span.from === span.to) return formatMonthYear(firstDayOf(span.from));
  return `de ${formatMonthYear(firstDayOf(span.from))} a ${formatMonthYear(firstDayOf(span.to))}`;
}

/** Rótulo curto do eixo ("set"). */
export function monthTick(month: YearMonth): string {
  return formatMonthShort(firstDayOf(month));
}

/** Rótulo completo da dica e das tabelas ("setembro de 2026"). */
export function monthName(month: YearMonth): string {
  return formatMonthYear(firstDayOf(month));
}

// ---------------------------------------------------------------- Patrimônio

export interface NetWorthSummary {
  /** Último mês com patrimônio conhecido. */
  last: { month: YearMonth; point: NetWorthPoint };
  /** Primeiro mês com patrimônio conhecido no período. */
  first: { month: YearMonth; point: NetWorthPoint };
  /** Variação do primeiro para o último. */
  change: Cents;
}

/** Patrimônio no fim do período e quanto mudou desde o primeiro mês conhecido. */
export function netWorthSummary(months: readonly AnalyticsMonth[]): NetWorthSummary | null {
  const known = months.flatMap((row) =>
    row.netWorth === null ? [] : [{ month: row.month, point: row.netWorth }],
  );
  const first = known[0];
  const last = known.at(-1);
  if (first === undefined || last === undefined) return null;
  return { first, last, change: last.point.total - first.point.total };
}

// ---------------------------------------------------------------- Categorias

export interface CategoryTrendRow {
  /** `null` = sem categoria. */
  id: number | null;
  name: string;
  color: CategoryColor | null;
  total: Cents;
  /** Fração das despesas do período (0–1). */
  share: number;
  previousTotal: Cents;
  /** Variação sobre o período anterior; `null` se não houve gasto nele. */
  change: number | null;
  months: Cents[];
}

/** Categorias com nome, cor, participação e variação sobre o período anterior. */
export function categoryTrendRows(
  trends: readonly CategoryTrend[],
  categories: ReadonlyMap<number, FinanceCategory>,
): CategoryTrendRow[] {
  const sum = trends.reduce((acc, trend) => acc + trend.total, 0);
  return trends.map((trend) => {
    const category = trend.categoryId === null ? undefined : categories.get(trend.categoryId);
    return {
      id: trend.categoryId,
      name: category?.name ?? NO_CATEGORY_LABEL,
      color: category?.color ?? null,
      total: trend.total,
      share: sum > 0 ? trend.total / sum : 0,
      previousTotal: trend.previousTotal,
      change: trend.previousTotal > 0 ? trend.total / trend.previousTotal - 1 : null,
      months: trend.months,
    };
  });
}

/** "+12%", "−8%", "igual" ou "sem gastos antes". */
export function changeText(change: number | null): string {
  if (change === null) return "sem gastos antes";
  // Abaixo de 0,5% o texto arredondado seria "0%".
  if (Math.abs(change) < 0.005) return "igual";
  const text = formatPercent(Math.abs(change), 0);
  return change > 0 ? `+${text}` : `−${text}`;
}
