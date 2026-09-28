import {
  type CalendarAgenda,
  type CalendarEvent,
  type DueReminder,
  type EventInput,
  type OccurrenceInput,
} from "@/features/productivity/calendar/types";
import { invokeCommand } from "@/services/tauri/commands";
import { type IsoDate } from "@/types/common";

/** Ocorrências de eventos e tarefas com vencimento entre `from` e `to` (até 100 dias). */
export function listCalendar(from: IsoDate, to: IsoDate): Promise<CalendarAgenda> {
  return invokeCommand("list_calendar", { from, to });
}

export function createCalendarEvent(input: EventInput): Promise<CalendarEvent> {
  return invokeCommand("create_calendar_event", { input });
}

/** Edita toda a série. Mudar o início ou a repetição descarta as alterações individuais. */
export function updateCalendarEvent(id: number, input: EventInput): Promise<CalendarEvent> {
  return invokeCommand("update_calendar_event", { id, input });
}

/** Edita só uma ocorrência de um evento recorrente. */
export async function updateEventOccurrence(
  eventId: number,
  occurrenceDate: IsoDate,
  input: OccurrenceInput,
): Promise<void> {
  await invokeCommand("update_event_occurrence", { eventId, occurrenceDate, input });
}

/** Exclusão definitiva e auditada da série. Só após confirmação explícita. */
export async function deleteCalendarEvent(id: number): Promise<void> {
  await invokeCommand("delete_calendar_event", { id });
}

/** Exclusão definitiva e auditada de uma ocorrência. Só após confirmação explícita. */
export async function deleteEventOccurrence(
  eventId: number,
  occurrenceDate: IsoDate,
): Promise<void> {
  await invokeCommand("delete_event_occurrence", { eventId, occurrenceDate });
}

/** Lembretes vencidos ainda não avisados; cada um é devolvido uma única vez. */
export function claimDueReminders(): Promise<DueReminder[]> {
  return invokeCommand("claim_due_reminders");
}
