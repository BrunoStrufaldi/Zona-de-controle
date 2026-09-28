import { type YearMonth } from "@/features/finance/types";
import { addDays, addMonths } from "@/lib/dates";
import { formatMonthYear } from "@/lib/format";
import { type IsoDate } from "@/types/common";

/** Período exibido na tela de lançamentos: um mês ou um ano inteiro. */
export type FinancePeriod = { kind: "month"; month: YearMonth } | { kind: "year"; year: number };

export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

/** Mês (`aaaa-mm`) de uma data `aaaa-mm-dd`. */
export function monthOf(date: IsoDate): YearMonth {
  return date.slice(0, 7);
}

/** Primeiro dia do mês, útil para formatar ("setembro de 2026"). */
export function firstDayOf(month: YearMonth): IsoDate {
  return `${month}-01`;
}

export function shiftMonth(month: YearMonth, months: number): YearMonth {
  return monthOf(addMonths(firstDayOf(month), months, 1));
}

export function monthRange(month: YearMonth): DateRange {
  const from = firstDayOf(month);
  return { from, to: addDays(addMonths(from, 1, 1), -1) };
}

export function periodRange(period: FinancePeriod): DateRange {
  if (period.kind === "month") return monthRange(period.month);
  return { from: `${period.year}-01-01`, to: `${period.year}-12-31` };
}

/** Avança ou volta um período (mês a mês ou ano a ano). */
export function shiftPeriod(period: FinancePeriod, steps: number): FinancePeriod {
  return period.kind === "month"
    ? { kind: "month", month: shiftMonth(period.month, steps) }
    : { kind: "year", year: period.year + steps };
}

/** O período contém a data? */
export function periodContains(period: FinancePeriod, date: IsoDate): boolean {
  const { from, to } = periodRange(period);
  return date >= from && date <= to;
}

/**
 * Data sugerida para um novo lançamento: hoje, se estiver no período exibido;
 * senão, o primeiro dia do período.
 */
export function defaultDateFor(period: FinancePeriod, today: IsoDate): IsoDate {
  return periodContains(period, today) ? today : periodRange(period).from;
}

/** Nome do período para exibição: "setembro de 2026" ou "2026". */
export function periodLabel(period: FinancePeriod): string {
  return period.kind === "month" ? formatMonthYear(firstDayOf(period.month)) : String(period.year);
}
