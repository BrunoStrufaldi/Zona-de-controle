import {
  type CalendarAgenda,
  type CalendarTask,
  type EventOccurrence,
  type TimeOfDay,
} from "@/features/productivity/calendar/types";
import { formatDayMonth } from "@/lib/format";
import { type IsoDate } from "@/types/common";

export const MINUTES_PER_DAY = 24 * 60;
/** Altura mínima (em minutos) de um evento na grade de horários. */
const MIN_BLOCK_MINUTES = 30;

/** Itens de um dia: faixa de dia inteiro (inclui eventos de vários dias), horários e tarefas. */
export interface DayItems {
  allDay: EventOccurrence[];
  timed: EventOccurrence[];
  tasks: CalendarTask[];
}

/** `HH:MM` → minutos desde a meia-noite. */
export function minutesOf(time: TimeOfDay): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Minutos desde a meia-noite → `HH:MM` (limitado ao dia). */
export function timeOf(minutes: number): TimeOfDay {
  const clamped = Math.min(Math.max(Math.round(minutes), 0), MINUTES_PER_DAY - 1);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/** Ocupa mais de um dia ou não tem horário: vai para a faixa de dia inteiro. */
export function spansAllDay(occurrence: EventOccurrence): boolean {
  return occurrence.allDay || occurrence.startDate !== occurrence.endDate;
}

/** Agrupa ocorrências e tarefas pelos dias exibidos (eventos longos aparecem em cada dia). */
export function itemsByDay(
  agenda: CalendarAgenda,
  days: readonly IsoDate[],
): Map<IsoDate, DayItems> {
  const byDay = new Map<IsoDate, DayItems>(
    days.map((day) => [day, { allDay: [], timed: [], tasks: [] }]),
  );
  for (const occurrence of agenda.occurrences) {
    for (const day of days) {
      if (day < occurrence.startDate || day > occurrence.endDate) continue;
      const items = byDay.get(day);
      if (!items) continue;
      (spansAllDay(occurrence) ? items.allDay : items.timed).push(occurrence);
    }
  }
  for (const task of agenda.tasks) {
    byDay.get(task.dueDate)?.tasks.push(task);
  }
  for (const items of byDay.values()) {
    items.timed.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  }
  return byDay;
}

/** Evento posicionado na grade: minutos de início/fim e coluna entre os sobrepostos. */
export interface PositionedOccurrence {
  occurrence: EventOccurrence;
  start: number;
  end: number;
  column: number;
  columns: number;
}

/**
 * Distribui eventos com horário que se sobrepõem em colunas lado a lado.
 * Cada grupo de eventos encadeados por sobreposição divide a largura igualmente.
 */
export function layoutTimed(occurrences: readonly EventOccurrence[]): PositionedOccurrence[] {
  const blocks = occurrences
    .map((occurrence) => {
      const start = minutesOf(occurrence.startTime ?? "00:00");
      const end = Math.min(
        Math.max(minutesOf(occurrence.endTime ?? "00:00"), start + MIN_BLOCK_MINUTES),
        MINUTES_PER_DAY,
      );
      return { occurrence, start, end, column: 0, columns: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const result: PositionedOccurrence[] = [];
  let group: PositionedOccurrence[] = [];
  let groupEnd = -1;
  const closeGroup = () => {
    const columns = Math.max(0, ...group.map((block) => block.column)) + 1;
    for (const block of group) block.columns = columns;
    result.push(...group);
    group = [];
  };

  for (const block of blocks) {
    if (block.start >= groupEnd && group.length > 0) closeGroup();
    // Primeira coluna livre (cujo último evento já terminou).
    const taken = new Set(
      group.filter((other) => other.end > block.start).map((other) => other.column),
    );
    let column = 0;
    while (taken.has(column)) column += 1;
    block.column = column;
    group.push(block);
    groupEnd = Math.max(groupEnd, block.end);
  }
  if (group.length > 0) closeGroup();
  return result;
}

/** Hora padrão no topo da grade de horários. */
const DEFAULT_SCROLL_HOUR = 7;
/** Horas mostradas antes de agora (hoje na grade) ou do primeiro evento. */
const SCROLL_LEAD_HOURS = 2;

/**
 * Hora no topo ao abrir a grade: com hoje na tela, pouco antes de agora (nunca
 * antes das 07:00); senão, pouco antes do primeiro evento com horário.
 */
export function initialScrollHour(
  days: readonly IsoDate[],
  byDay: ReadonlyMap<IsoDate, DayItems>,
  today: IsoDate,
  nowMinutes: number,
): number {
  if (days.includes(today)) {
    return Math.max(DEFAULT_SCROLL_HOUR, Math.floor(nowMinutes / 60) - SCROLL_LEAD_HOURS);
  }
  const starts = days.flatMap((day) =>
    (byDay.get(day)?.timed ?? []).map((occurrence) => minutesOf(occurrence.startTime ?? "00:00")),
  );
  if (starts.length === 0) return DEFAULT_SCROLL_HOUR;
  return Math.max(0, Math.floor(Math.min(...starts) / 60) - 1);
}

/** "Dia inteiro", "14:00 – 15:30" ou, em vários dias, "25/09 22:00 – 26/09 02:00". */
export function timeRangeLabel(
  occurrence: Pick<EventOccurrence, "allDay" | "startDate" | "startTime" | "endDate" | "endTime">,
): string {
  const multiDay = occurrence.startDate !== occurrence.endDate;
  if (occurrence.allDay) {
    return multiDay
      ? `${formatDayMonth(occurrence.startDate)} – ${formatDayMonth(occurrence.endDate)}`
      : "Dia inteiro";
  }
  const start = occurrence.startTime ?? "";
  const end = occurrence.endTime ?? "";
  if (!multiDay) return start === end ? start : `${start} – ${end}`;
  return `${formatDayMonth(occurrence.startDate)} ${start} – ${formatDayMonth(occurrence.endDate)} ${end}`;
}

/** Chave única de uma ocorrência (para listas do React). */
export function occurrenceKey(occurrence: Pick<EventOccurrence, "eventId" | "occurrenceDate">) {
  return `${occurrence.eventId}@${occurrence.occurrenceDate}`;
}
