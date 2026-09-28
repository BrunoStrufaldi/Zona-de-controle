import { MINUTES_PER_DAY, minutesOf, timeOf } from "@/features/productivity/calendar/domain/agenda";
import {
  type CalendarEvent,
  type EventInput,
  type EventOccurrence,
  type EventRecurrence,
  type OccurrenceInput,
  type TimeOfDay,
} from "@/features/productivity/calendar/types";
import { addDays, daysBetween } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { describeRepeat } from "@/lib/recurrence";
import { type IsoDate } from "@/types/common";
import { type CategoryColor } from "@/types/palette";
import { type RecurrenceFrequency } from "@/types/recurrence";

/** Limites espelhados de `src-tauri/src/domain/calendar_events.rs`. */
export const EVENT_LIMITS = {
  titleChars: 120,
  descriptionChars: 4000,
  locationChars: 200,
  durationDays: 366,
  interval: 99,
  count: 999,
} as const;

export const DEFAULT_EVENT_COLOR: CategoryColor = "blue";

export type RepeatEnd = "never" | "until" | "count";

/** Estado do formulário. Horários ficam guardados mesmo em "dia inteiro". */
export interface EventDraft {
  title: string;
  description: string;
  location: string;
  color: CategoryColor;
  allDay: boolean;
  startDate: IsoDate;
  startTime: TimeOfDay;
  endDate: IsoDate;
  endTime: TimeOfDay;
  reminderMinutes: number | null;
  repeat: RecurrenceFrequency | null;
  interval: number;
  weekdays: number[];
  repeatEnd: RepeatEnd;
  until: IsoDate;
  count: number;
}

export type EventDraftErrors = Partial<
  Record<"title" | "start" | "end" | "interval" | "until" | "count", string>
>;

function repeatFields(
  rule: EventRecurrence | null,
  startDate: IsoDate,
): Pick<EventDraft, "repeat" | "interval" | "weekdays" | "repeatEnd" | "until" | "count"> {
  return {
    repeat: rule?.frequency ?? null,
    interval: rule?.interval ?? 1,
    weekdays: rule ? [...rule.weekdays] : [],
    repeatEnd: rule?.until ? "until" : rule?.count ? "count" : "never",
    until: rule?.until ?? addDays(startDate, 30),
    count: rule?.count ?? 10,
  };
}

/** Evento novo em `date`, das `hour`:00 por uma hora (padrão: 09:00). */
export function newEventDraft(date: IsoDate, hour = 9): EventDraft {
  const start = Math.min(Math.max(hour, 0), 23) * 60;
  return {
    title: "",
    description: "",
    location: "",
    color: DEFAULT_EVENT_COLOR,
    allDay: false,
    startDate: date,
    startTime: timeOf(start),
    endDate: date,
    endTime: timeOf(Math.min(start + 60, MINUTES_PER_DAY - 1)),
    reminderMinutes: null,
    ...repeatFields(null, date),
  };
}

type DraftSource = Pick<
  CalendarEvent,
  | "title"
  | "description"
  | "location"
  | "color"
  | "allDay"
  | "startDate"
  | "startTime"
  | "endDate"
  | "endTime"
  | "reminderMinutes"
>;

function draftFrom(source: DraftSource, rule: EventRecurrence | null): EventDraft {
  return {
    title: source.title,
    description: source.description,
    location: source.location,
    color: source.color,
    allDay: source.allDay,
    startDate: source.startDate,
    startTime: source.startTime ?? "09:00",
    endDate: source.endDate,
    endTime: source.endTime ?? "10:00",
    reminderMinutes: source.reminderMinutes,
    ...repeatFields(rule, source.startDate),
  };
}

/** Formulário de "toda a série". */
export function draftFromEvent(event: CalendarEvent): EventDraft {
  return draftFrom(event, event.recurrence);
}

/** Formulário de "só esta ocorrência" (sem repetição). */
export function draftFromOccurrence(occurrence: EventOccurrence): EventDraft {
  return draftFrom(occurrence, null);
}

/** Duração em minutos (negativa se o término vier antes do início). */
function durationMinutes(draft: EventDraft): number {
  const days = daysBetween(draft.startDate, draft.endDate);
  if (draft.allDay) return days * MINUTES_PER_DAY;
  return days * MINUTES_PER_DAY + minutesOf(draft.endTime) - minutesOf(draft.startTime);
}

/** Muda o início mantendo a duração (o término acompanha). */
export function withStart(draft: EventDraft, startDate: IsoDate, startTime: TimeOfDay): EventDraft {
  if (startDate === "" || startTime === "") return { ...draft, startDate, startTime };
  const current = draft.startDate === "" || draft.endDate === "" ? -1 : durationMinutes(draft);
  const duration = current >= 0 ? current : 60;
  const end = minutesOf(startTime) + duration;
  return {
    ...draft,
    startDate,
    startTime,
    endDate: addDays(startDate, Math.floor(end / MINUTES_PER_DAY)),
    endTime: draft.allDay ? draft.endTime : timeOf(end % MINUTES_PER_DAY),
  };
}

/** Validação do formulário (o backend valida de novo). */
export function validateEventDraft(draft: EventDraft, withRecurrence: boolean): EventDraftErrors {
  const errors: EventDraftErrors = {};
  const title = draft.title.trim();
  if (title === "") errors.title = "Informe um título.";
  else if (title.length > EVENT_LIMITS.titleChars)
    errors.title = `Use no máximo ${EVENT_LIMITS.titleChars} caracteres.`;

  const missingTime = !draft.allDay && (draft.startTime === "" || draft.endTime === "");
  if (draft.startDate === "" || draft.endDate === "" || missingTime) {
    errors.start = "Informe início e término.";
  } else if (durationMinutes(draft) < 0) {
    errors.end = "O término não pode ser antes do início.";
  } else if (daysBetween(draft.startDate, draft.endDate) > EVENT_LIMITS.durationDays) {
    errors.end = `Um evento pode durar no máximo ${EVENT_LIMITS.durationDays} dias.`;
  }

  if (withRecurrence && draft.repeat !== null) {
    const { interval, count } = draft;
    if (!Number.isInteger(interval) || interval < 1 || interval > EVENT_LIMITS.interval) {
      errors.interval = `Use um número de 1 a ${EVENT_LIMITS.interval}.`;
    }
    if (draft.repeatEnd === "until" && (draft.until === "" || draft.until < draft.startDate)) {
      errors.until = "A data final não pode ser antes do início.";
    }
    if (
      draft.repeatEnd === "count" &&
      (!Number.isInteger(count) || count < 1 || count > EVENT_LIMITS.count)
    ) {
      errors.count = `Use um número de 1 a ${EVENT_LIMITS.count}.`;
    }
  }
  return errors;
}

export function toOccurrenceInput(draft: EventDraft): OccurrenceInput {
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    location: draft.location.trim(),
    allDay: draft.allDay,
    startDate: draft.startDate,
    startTime: draft.allDay ? null : draft.startTime,
    endDate: draft.endDate,
    endTime: draft.allDay ? null : draft.endTime,
    reminderMinutes: draft.reminderMinutes,
  };
}

export function toEventInput(draft: EventDraft): EventInput {
  const recurrence: EventRecurrence | null =
    draft.repeat === null
      ? null
      : {
          frequency: draft.repeat,
          interval: draft.interval,
          weekdays: draft.repeat === "weekly" ? [...draft.weekdays].sort((a, b) => a - b) : [],
          until: draft.repeatEnd === "until" ? draft.until : null,
          count: draft.repeatEnd === "count" ? draft.count : null,
        };
  return { ...toOccurrenceInput(draft), color: draft.color, recurrence };
}

/** A edição muda as datas das ocorrências (o backend descarta as exceções)? */
export function changesOccurrenceDates(event: CalendarEvent, input: EventInput): boolean {
  return (
    event.startDate !== input.startDate ||
    JSON.stringify(event.recurrence) !== JSON.stringify(input.recurrence)
  );
}

// ---- Lembretes ---------------------------------------------------------------

const TIMED_REMINDERS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080] as const;
const ALL_DAY_REMINDERS = [0, 1440, 2880, 10080] as const;

/** Opções do seletor de lembrete (o valor atual entra na lista se for diferente). */
export function reminderChoices(allDay: boolean, current: number | null): number[] {
  const base: number[] = [...(allDay ? ALL_DAY_REMINDERS : TIMED_REMINDERS)];
  if (current !== null && !base.includes(current)) base.push(current);
  return base.sort((a, b) => a - b);
}

/** Ao alternar "dia inteiro", troca lembretes que não fazem sentido pela opção mais próxima. */
export function normalizeReminder(minutes: number | null, allDay: boolean): number | null {
  if (minutes === null || !allDay) return minutes;
  return ALL_DAY_REMINDERS.includes(minutes as (typeof ALL_DAY_REMINDERS)[number]) ? minutes : 0;
}

function amount(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function beforeLabel(minutes: number): string {
  if (minutes % 10080 === 0) return amount(minutes / 10080, "semana", "semanas");
  if (minutes % 1440 === 0) return amount(minutes / 1440, "dia", "dias");
  if (minutes % 60 === 0) return amount(minutes / 60, "hora", "horas");
  return amount(minutes, "minuto", "minutos");
}

/** "Sem lembrete", "15 minutos antes", "1 dia antes, às 09:00"… */
export function reminderLabel(minutes: number | null, allDay: boolean): string {
  if (minutes === null) return "Sem lembrete";
  if (allDay) {
    // O lembrete do dia inteiro é contado a partir das 09:00 do primeiro dia.
    if (minutes === 0) return "No dia, às 09:00";
    if (minutes % 1440 === 0) return `${beforeLabel(minutes)} antes, às 09:00`;
    return `${beforeLabel(minutes)} antes das 09:00`;
  }
  return minutes === 0 ? "No horário do evento" : `${beforeLabel(minutes)} antes`;
}

/** "Toda semana: seg, qua, até 31/12/2026" / "Todo dia, 10 vezes". */
export function describeEventRecurrence(rule: EventRecurrence): string {
  const base = describeRepeat(rule);
  if (rule.until) return `${base}, até ${formatDate(rule.until)}`;
  if (rule.count) return `${base}, ${amount(rule.count, "vez", "vezes")}`;
  return base;
}
