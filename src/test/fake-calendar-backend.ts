import { vi } from "vitest";

import {
  type CalendarEvent,
  type CalendarTask,
  type DueReminder,
  type EventInput,
  type EventOccurrence,
  type OccurrenceInput,
} from "@/features/productivity/calendar/types";
import { addDays, daysBetween, toIsoDate } from "@/lib/dates";
import { mockDesktopRuntime } from "@/test/tauri";

/** Evento inicial: `dayOffset` dias a partir de hoje. */
export interface EventSeed extends Partial<EventInput> {
  title: string;
  dayOffset?: number;
}

const NOT_FOUND = { kind: "not_found", message: "evento não encontrado" };

/**
 * Backend do calendário em memória para testes de interface. Simplificação:
 * só repetições diária e semanal (sem dias escolhidos) são expandidas.
 */
export function mockCalendarBackend(
  seeds: EventSeed[] = [],
  options: { tasks?: CalendarTask[]; reminders?: DueReminder[] } = {},
) {
  const today = toIsoDate(new Date());
  let nextId = 1;
  let events: CalendarEvent[] = [];
  /** `id@data` → `null` (cancelada) ou dados alterados. */
  const exceptions = new Map<string, OccurrenceInput | null>();
  let reminders = [...(options.reminders ?? [])];

  const store = (id: number, input: EventInput): CalendarEvent => ({
    ...input,
    id,
    exceptions: [...exceptions.keys()].filter((key) => key.startsWith(`${id}@`)).length,
    createdAt: "2026-09-25T12:00:00Z",
    updatedAt: "2026-09-25T12:00:00Z",
  });

  for (const { dayOffset = 0, ...seed } of seeds) {
    const date = addDays(today, dayOffset);
    const input: EventInput = {
      description: "",
      location: "",
      color: "blue",
      allDay: false,
      startDate: date,
      startTime: "10:00",
      endDate: date,
      endTime: "11:00",
      reminderMinutes: null,
      recurrence: null,
      ...seed,
    };
    events.push(store(nextId++, input));
  }

  const ruleDates = (event: CalendarEvent, to: string): string[] => {
    const rule = event.recurrence;
    if (!rule) return [event.startDate];
    const step = rule.frequency === "daily" ? rule.interval : rule.interval * 7;
    const dates: string[] = [];
    for (let date = event.startDate; date <= to; date = addDays(date, step)) {
      if (rule.count !== null && dates.length >= rule.count) break;
      if (rule.until !== null && date > rule.until) break;
      dates.push(date);
      if (rule.frequency !== "daily" && rule.frequency !== "weekly") break;
    }
    return dates;
  };

  const occurrencesOf = (event: CalendarEvent, from: string, to: string): EventOccurrence[] => {
    const duration = daysBetween(event.startDate, event.endDate);
    return ruleDates(event, to).flatMap((date) => {
      const override = exceptions.get(`${event.id}@${date}`);
      if (override === null) return [];
      const details = override ?? { ...event, startDate: date, endDate: addDays(date, duration) };
      if (details.startDate > to || details.endDate < from) return [];
      return [
        {
          eventId: event.id,
          occurrenceDate: date,
          title: details.title,
          description: details.description,
          location: details.location,
          color: event.color,
          allDay: details.allDay,
          startDate: details.startDate,
          startTime: details.startTime,
          endDate: details.endDate,
          endTime: details.endTime,
          reminderMinutes: details.reminderMinutes,
          recurring: event.recurrence !== null,
          modified: override !== undefined,
        },
      ];
    });
  };

  const find = (id: number) => {
    const event = events.find((current) => current.id === id);
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (!event) throw NOT_FOUND;
    return event;
  };

  const handlers = {
    list_calendar: vi.fn(({ from, to }: { from: string; to: string }) => {
      const found = events.map((event) => ({ event, list: occurrencesOf(event, from, to) }));
      return {
        events: found.filter(({ list }) => list.length > 0).map(({ event }) => event),
        occurrences: found
          .flatMap(({ list }) => list)
          .sort((a, b) =>
            `${a.startDate}${a.startTime ?? ""}`.localeCompare(
              `${b.startDate}${b.startTime ?? ""}`,
            ),
          ),
        tasks: (options.tasks ?? []).filter((task) => task.dueDate >= from && task.dueDate <= to),
      };
    }),
    create_calendar_event: vi.fn(({ input }: { input: EventInput }) => {
      const event = store(nextId++, input);
      events = [...events, event];
      return event;
    }),
    update_calendar_event: vi.fn(({ id, input }: { id: number; input: EventInput }) => {
      find(id);
      const event = store(id, input);
      events = events.map((current) => (current.id === id ? event : current));
      return event;
    }),
    update_event_occurrence: vi.fn(
      ({
        eventId,
        occurrenceDate,
        input,
      }: {
        eventId: number;
        occurrenceDate: string;
        input: OccurrenceInput;
      }) => {
        find(eventId);
        exceptions.set(`${eventId}@${occurrenceDate}`, input);
        return null;
      },
    ),
    delete_calendar_event: vi.fn(({ id }: { id: number }) => {
      find(id);
      events = events.filter((event) => event.id !== id);
      return null;
    }),
    delete_event_occurrence: vi.fn(
      ({ eventId, occurrenceDate }: { eventId: number; occurrenceDate: string }) => {
        find(eventId);
        exceptions.set(`${eventId}@${occurrenceDate}`, null);
        return null;
      },
    ),
    claim_due_reminders: vi.fn(() => {
      const claimed = reminders;
      reminders = [];
      return claimed;
    }),
  };

  mockDesktopRuntime(handlers);
  return { handlers, today };
}
