import { type IsoDate, type IsoDateTime } from "@/types/common";
import { type CategoryColor } from "@/types/palette";
import { type RecurrenceFrequency } from "@/types/recurrence";

/** Contrato do Calendário. Espelha `src-tauri/src/domain/calendar_events.rs` — mantenha em sincronia. */

/** Horário local `HH:MM`. */
export type TimeOfDay = string;

export type CalendarView = "month" | "week" | "day";

/**
 * Repetição a cada `interval` dias/semanas/meses/anos. Na semanal, `weekdays`
 * (0 = domingo) escolhe os dias; vazio = mesmo dia da semana do início.
 * Termina, opcionalmente, em `until` (inclusive) ou após `count` ocorrências.
 */
export interface EventRecurrence {
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays: number[];
  until: IsoDate | null;
  count: number | null;
}

/** Série (dados base usados em "editar toda a série"). */
export interface CalendarEvent {
  id: number;
  title: string;
  description: string;
  location: string;
  color: CategoryColor;
  allDay: boolean;
  startDate: IsoDate;
  /** `null` em eventos de dia inteiro. */
  startTime: TimeOfDay | null;
  endDate: IsoDate;
  endTime: TimeOfDay | null;
  /** Minutos antes do início (dia inteiro: antes das 09:00). */
  reminderMinutes: number | null;
  recurrence: EventRecurrence | null;
  /** Ocorrências alteradas ou excluídas individualmente. */
  exceptions: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Ocorrência calculada de um evento (identificada por `eventId` + `occurrenceDate`). */
export interface EventOccurrence {
  eventId: number;
  /** Data original na série (a ocorrência pode ter sido movida para outro dia). */
  occurrenceDate: IsoDate;
  title: string;
  description: string;
  location: string;
  color: CategoryColor;
  allDay: boolean;
  startDate: IsoDate;
  startTime: TimeOfDay | null;
  endDate: IsoDate;
  endTime: TimeOfDay | null;
  reminderMinutes: number | null;
  recurring: boolean;
  /** Alterada individualmente. */
  modified: boolean;
}

export type CalendarTaskStatus = "todo" | "in_progress" | "done";
export type CalendarTaskPriority = "low" | "medium" | "high" | "urgent";

/** Tarefa com vencimento no intervalo (somente leitura no calendário). */
export interface CalendarTask {
  id: number;
  title: string;
  dueDate: IsoDate;
  status: CalendarTaskStatus;
  priority: CalendarTaskPriority;
}

export interface CalendarAgenda {
  /** Séries com alguma ocorrência no intervalo. */
  events: CalendarEvent[];
  occurrences: EventOccurrence[];
  tasks: CalendarTask[];
}

/** Dados de uma única ocorrência ("só esta ocorrência"). */
export interface OccurrenceInput {
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  startDate: IsoDate;
  startTime: TimeOfDay | null;
  endDate: IsoDate;
  endTime: TimeOfDay | null;
  reminderMinutes: number | null;
}

/** Dados da série (criação e "toda a série"). */
export interface EventInput extends OccurrenceInput {
  color: CategoryColor;
  recurrence: EventRecurrence | null;
}

/** Lembrete vencido, devolvido uma única vez pelo backend. */
export interface DueReminder {
  eventId: number;
  occurrenceDate: IsoDate;
  title: string;
  location: string;
  allDay: boolean;
  startDate: IsoDate;
  startTime: TimeOfDay | null;
  /** `aaaa-mm-ddTHH:MM` local. */
  remindAt: string;
}
