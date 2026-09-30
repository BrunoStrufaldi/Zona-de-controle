import { type DateRange, firstDayOf, monthOf } from "@/features/finance/domain/period";
import { addDays, addMonths, dayOfMonth } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { type IsoDate } from "@/types/common";

/** Períodos do desempenho, todos terminando hoje. */
export const PERFORMANCE_PERIODS = ["month", "year", "12m", "all"] as const;
export type PerformancePeriod = (typeof PERFORMANCE_PERIODS)[number];

export const performancePeriodLabels: Record<PerformancePeriod, string> = {
  month: "Este mês",
  year: "Este ano",
  "12m": "12 meses",
  all: "Desde o início",
};

/** "Desde o início": antes de qualquer movimentação. */
export const PORTFOLIO_START: IsoDate = "2000-01-01";

/** Intervalo do período, terminando hoje. */
export function performanceRange(period: PerformancePeriod, today: IsoDate): DateRange {
  switch (period) {
    case "month":
      return { from: firstDayOf(monthOf(today)), to: today };
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "12m":
      return { from: addDays(addMonths(today, -12, dayOfMonth(today)), 1), to: today };
    case "all":
      return { from: PORTFOLIO_START, to: today };
  }
}

/** "de 01/09/2026 a 30/09/2026" ou "desde o início". */
export function describeRange(range: DateRange): string {
  if (range.from === PORTFOLIO_START) return "desde o início";
  return `de ${formatDate(range.from)} a ${formatDate(range.to)}`;
}

/** Prazo até o vencimento: "vence hoje", "vence em 76 dias", "venceu há 29 dias". */
export function maturityText(days: number): string {
  if (days === 0) return "vence hoje";
  if (days === 1) return "vence amanhã";
  if (days === -1) return "venceu ontem";
  return days > 0 ? `vence em ${days} dias` : `venceu há ${-days} dias`;
}
