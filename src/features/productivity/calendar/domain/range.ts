import { type CalendarView } from "@/features/productivity/calendar/types";
import { addDays, addMonths, weekdayOf } from "@/lib/dates";
import { formatDateRange, formatFullDate, formatMonthYear } from "@/lib/format";
import { type IsoDate } from "@/types/common";

/** Intervalo de datas exibido por uma visão (semanas de domingo a sábado). */
export interface ViewRange {
  from: IsoDate;
  to: IsoDate;
  days: IsoDate[];
}

/** Semanas exibidas na visão mensal (sempre 6, para a grade não mudar de altura). */
export const MONTH_GRID_WEEKS = 6;

export const viewLabels: Record<CalendarView, string> = {
  month: "Mês",
  week: "Semana",
  day: "Dia",
};

function firstOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 8)}01`;
}

function startOfWeek(date: IsoDate): IsoDate {
  return addDays(date, -weekdayOf(date));
}

function daysFrom(start: IsoDate, count: number): IsoDate[] {
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

export function viewRange(view: CalendarView, anchor: IsoDate): ViewRange {
  const days =
    view === "month"
      ? daysFrom(startOfWeek(firstOfMonth(anchor)), MONTH_GRID_WEEKS * 7)
      : view === "week"
        ? daysFrom(startOfWeek(anchor), 7)
        : [anchor];
  return { from: days[0] ?? anchor, to: days[days.length - 1] ?? anchor, days };
}

/** Data de referência do período anterior (`-1`) ou seguinte (`1`). */
export function shiftAnchor(view: CalendarView, anchor: IsoDate, direction: -1 | 1): IsoDate {
  switch (view) {
    case "month":
      return addMonths(firstOfMonth(anchor), direction, 1);
    case "week":
      return addDays(anchor, 7 * direction);
    case "day":
      return addDays(anchor, direction);
  }
}

/** Título do período (ex.: "setembro de 2026", "20 – 26 de set. de 2026"). */
export function viewTitle(view: CalendarView, anchor: IsoDate): string {
  switch (view) {
    case "month":
      return formatMonthYear(anchor);
    case "week": {
      const { from, to } = viewRange("week", anchor);
      return formatDateRange(from, to);
    }
    case "day":
      return formatFullDate(anchor);
  }
}

/** A data pertence ao mês da data de referência? */
export function isSameMonth(date: IsoDate, anchor: IsoDate): boolean {
  return date.slice(0, 7) === anchor.slice(0, 7);
}
