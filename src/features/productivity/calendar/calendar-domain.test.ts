import { describe, expect, it } from "vitest";

import {
  initialScrollHour,
  itemsByDay,
  layoutTimed,
  minutesOf,
  timeOf,
  timeRangeLabel,
} from "@/features/productivity/calendar/domain/agenda";
import {
  changesOccurrenceDates,
  describeEventRecurrence,
  draftFromEvent,
  newEventDraft,
  normalizeReminder,
  reminderChoices,
  reminderLabel,
  toEventInput,
  toOccurrenceInput,
  validateEventDraft,
  withStart,
} from "@/features/productivity/calendar/domain/input";
import { shiftAnchor, viewRange, viewTitle } from "@/features/productivity/calendar/domain/range";
import { reminderMessage } from "@/features/productivity/calendar/domain/reminders";
import {
  type CalendarEvent,
  type EventOccurrence,
  type EventRecurrence,
} from "@/features/productivity/calendar/types";

function occurrence(partial: Partial<EventOccurrence>): EventOccurrence {
  return {
    eventId: 1,
    occurrenceDate: "2026-09-25",
    title: "Evento",
    description: "",
    location: "",
    color: "blue",
    allDay: false,
    startDate: "2026-09-25",
    startTime: "10:00",
    endDate: "2026-09-25",
    endTime: "11:00",
    reminderMinutes: null,
    recurring: false,
    modified: false,
    ...partial,
  };
}

const WEEKLY: EventRecurrence = {
  frequency: "weekly",
  interval: 1,
  weekdays: [1, 3],
  until: null,
  count: null,
};

function event(partial: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 1,
    title: "Aula",
    description: "",
    location: "",
    color: "teal",
    allDay: false,
    startDate: "2026-09-21",
    startTime: "19:00",
    endDate: "2026-09-21",
    endTime: "21:00",
    reminderMinutes: 30,
    recurrence: WEEKLY,
    exceptions: 0,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("intervalos das visões", () => {
  it("monta a grade mensal de 6 semanas começando no domingo", () => {
    const range = viewRange("month", "2026-09-25");
    expect(range.days).toHaveLength(42);
    expect(range.from).toBe("2026-08-30"); // domingo antes de 01/09 (terça)
    expect(range.to).toBe("2026-10-10");
  });

  it("monta semana (domingo a sábado) e dia", () => {
    expect(viewRange("week", "2026-09-25")).toMatchObject({ from: "2026-09-20", to: "2026-09-26" });
    expect(viewRange("day", "2026-09-25").days).toEqual(["2026-09-25"]);
  });

  it("navega entre períodos", () => {
    expect(shiftAnchor("month", "2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftAnchor("month", "2026-01-15", -1)).toBe("2025-12-01");
    expect(shiftAnchor("week", "2026-09-25", -1)).toBe("2026-09-18");
    expect(shiftAnchor("day", "2026-12-31", 1)).toBe("2027-01-01");
  });

  it("gera títulos em pt-BR", () => {
    expect(viewTitle("month", "2026-09-25")).toBe("setembro de 2026");
    expect(viewTitle("week", "2026-09-25")).toMatch(/^20\s–\s26 de set\. de 2026$/);
    expect(viewTitle("day", "2026-09-25")).toBe("sexta-feira, 25 de setembro de 2026");
  });
});

describe("agenda por dia", () => {
  it("separa dia inteiro, horários e tarefas, repetindo eventos longos", () => {
    const trip = occurrence({
      eventId: 2,
      allDay: true,
      startDate: "2026-09-24",
      endDate: "2026-09-26",
    });
    const late = occurrence({ eventId: 3, startTime: "18:00", endTime: "19:00" });
    const early = occurrence({ eventId: 4, startTime: "08:00", endTime: "09:00" });
    const byDay = itemsByDay(
      {
        events: [],
        occurrences: [trip, late, early],
        tasks: [{ id: 1, title: "T", dueDate: "2026-09-25", status: "todo", priority: "low" }],
      },
      ["2026-09-25", "2026-09-26"],
    );
    const friday = byDay.get("2026-09-25");
    expect(friday?.allDay).toEqual([trip]);
    expect(friday?.timed.map((item) => item.eventId)).toEqual([4, 3]);
    expect(friday?.tasks).toHaveLength(1);
    expect(byDay.get("2026-09-26")?.allDay).toEqual([trip]);
    expect(byDay.get("2026-09-26")?.timed).toEqual([]);
  });

  it("distribui eventos sobrepostos em colunas", () => {
    const layout = layoutTimed([
      occurrence({ eventId: 1, startTime: "09:00", endTime: "11:00" }),
      occurrence({ eventId: 2, startTime: "10:00", endTime: "10:30" }),
      occurrence({ eventId: 3, startTime: "10:30", endTime: "12:00" }),
      occurrence({ eventId: 4, startTime: "13:00", endTime: "13:00" }),
    ]);
    const byId = new Map(layout.map((block) => [block.occurrence.eventId, block]));
    expect(byId.get(1)).toMatchObject({ column: 0, columns: 2 });
    expect(byId.get(2)).toMatchObject({ column: 1, columns: 2 });
    // Começa quando o 2º termina: reaproveita a coluna 1.
    expect(byId.get(3)).toMatchObject({ column: 1, columns: 2 });
    // Evento pontual ganha altura mínima e fica sozinho.
    expect(byId.get(4)).toMatchObject({ column: 0, columns: 1, start: 780, end: 810 });
  });

  it("escolhe a hora inicial da grade", () => {
    const evening = occurrence({ startTime: "19:00", endTime: "20:00" });
    const byDay = itemsByDay({ events: [], occurrences: [evening], tasks: [] }, ["2026-09-25"]);
    // Hoje na tela: pouco antes de agora, nunca antes das 07:00.
    expect(initialScrollHour(["2026-09-25"], byDay, "2026-09-25", 20 * 60)).toBe(18);
    expect(initialScrollHour(["2026-09-25"], byDay, "2026-09-25", 3 * 60)).toBe(7);
    // Outro período: pouco antes do primeiro evento; sem eventos, 07:00.
    expect(initialScrollHour(["2026-09-25"], byDay, "2026-09-20", 0)).toBe(18);
    expect(initialScrollHour(["2026-09-26"], new Map(), "2026-09-20", 0)).toBe(7);
  });

  it("converte horários e descreve intervalos", () => {
    expect(minutesOf("14:30")).toBe(870);
    expect(timeOf(870)).toBe("14:30");
    expect(timeOf(2000)).toBe("23:59");
    expect(timeRangeLabel(occurrence({}))).toBe("10:00 – 11:00");
    expect(timeRangeLabel(occurrence({ endTime: "10:00" }))).toBe("10:00");
    expect(timeRangeLabel(occurrence({ allDay: true }))).toBe("Dia inteiro");
    expect(
      timeRangeLabel(occurrence({ startTime: "22:00", endDate: "2026-09-26", endTime: "02:00" })),
    ).toBe("25/09 22:00 – 26/09 02:00");
  });
});

describe("formulário de evento", () => {
  it("cria o rascunho padrão e mantém a duração ao mudar o início", () => {
    const draft = newEventDraft("2026-09-25", 14);
    expect(draft).toMatchObject({ startTime: "14:00", endTime: "15:00", repeat: null });
    expect(newEventDraft("2026-09-25", 23).endTime).toBe("23:59");

    const moved = withStart({ ...draft, endTime: "16:30" }, "2026-09-25", "23:00");
    expect(moved).toMatchObject({ endDate: "2026-09-26", endTime: "01:30" });
    const otherDay = withStart(draft, "2026-10-01", draft.startTime);
    expect(otherDay).toMatchObject({ endDate: "2026-10-01", endTime: "15:00" });
  });

  it("valida título, término e repetição", () => {
    const draft = { ...newEventDraft("2026-09-25"), title: "Evento" };
    expect(validateEventDraft(draft, true)).toEqual({});
    expect(validateEventDraft({ ...draft, title: " " }, true).title).toBe("Informe um título.");
    expect(validateEventDraft({ ...draft, endTime: "08:00" }, true).end).toBeDefined();
    expect(validateEventDraft({ ...draft, startTime: "" }, true).start).toBeDefined();
    // Dia inteiro ignora os horários.
    expect(validateEventDraft({ ...draft, allDay: true, endTime: "08:00" }, true)).toEqual({});

    const repeating = { ...draft, repeat: "daily" as const };
    expect(validateEventDraft({ ...repeating, interval: 0 }, true).interval).toBeDefined();
    expect(
      validateEventDraft({ ...repeating, repeatEnd: "until", until: "2026-09-24" }, true).until,
    ).toBeDefined();
    expect(
      validateEventDraft({ ...repeating, repeatEnd: "count", count: 0 }, true).count,
    ).toBeDefined();
    // Em "só esta ocorrência" a repetição não é validada.
    expect(validateEventDraft({ ...repeating, interval: 0 }, false)).toEqual({});
  });

  it("converte o rascunho em entrada da série ou da ocorrência", () => {
    const draft = draftFromEvent(event());
    expect(draft).toMatchObject({ repeat: "weekly", weekdays: [1, 3], repeatEnd: "never" });
    expect(toEventInput({ ...draft, title: " Aula ", weekdays: [3, 1] })).toEqual({
      title: "Aula",
      description: "",
      location: "",
      allDay: false,
      startDate: "2026-09-21",
      startTime: "19:00",
      endDate: "2026-09-21",
      endTime: "21:00",
      reminderMinutes: 30,
      color: "teal",
      recurrence: WEEKLY,
    });
    expect(toEventInput({ ...draft, repeatEnd: "count", count: 5 }).recurrence?.count).toBe(5);
    expect(toEventInput({ ...draft, repeat: "monthly" }).recurrence?.weekdays).toEqual([]);

    const allDay = toOccurrenceInput({ ...draft, allDay: true });
    expect(allDay).toMatchObject({ startTime: null, endTime: null });
    expect(allDay).not.toHaveProperty("recurrence");
  });

  it("detecta mudanças que descartam exceções", () => {
    const current = event({ exceptions: 2 });
    const input = toEventInput(draftFromEvent(current));
    expect(changesOccurrenceDates(current, { ...input, title: "Outro" })).toBe(false);
    expect(changesOccurrenceDates(current, { ...input, startDate: "2026-09-22" })).toBe(true);
    expect(changesOccurrenceDates(current, { ...input, recurrence: null })).toBe(true);
  });

  it("descreve lembretes e repetição", () => {
    expect(reminderLabel(null, false)).toBe("Sem lembrete");
    expect(reminderLabel(0, false)).toBe("No horário do evento");
    expect(reminderLabel(90, false)).toBe("90 minutos antes");
    expect(reminderLabel(120, false)).toBe("2 horas antes");
    expect(reminderLabel(0, true)).toBe("No dia, às 09:00");
    expect(reminderLabel(10080, true)).toBe("1 semana antes, às 09:00");
    expect(reminderChoices(true, 45)).toEqual([0, 45, 1440, 2880, 10080]);
    expect(normalizeReminder(15, true)).toBe(0);
    expect(normalizeReminder(1440, true)).toBe(1440);
    expect(normalizeReminder(15, false)).toBe(15);

    expect(describeEventRecurrence(WEEKLY)).toBe("Toda semana: seg, qua");
    expect(describeEventRecurrence({ ...WEEKLY, until: "2026-12-31" })).toBe(
      "Toda semana: seg, qua, até 31/12/2026",
    );
    expect(
      describeEventRecurrence({
        ...WEEKLY,
        frequency: "daily",
        interval: 2,
        weekdays: [],
        count: 1,
      }),
    ).toBe("A cada 2 dias, 1 vez");
  });
});

describe("notificação de lembrete", () => {
  const reminder = {
    eventId: 1,
    occurrenceDate: "2026-09-25",
    title: "Dentista",
    location: "",
    allDay: false,
    startDate: "2026-09-25",
    startTime: "14:30",
    remindAt: "2026-09-25T14:20",
  };

  it("descreve quando e onde", () => {
    expect(reminderMessage(reminder, "2026-09-25")).toEqual({
      title: "Dentista",
      body: "Hoje às 14:30",
    });
    expect(reminderMessage({ ...reminder, location: "Clínica" }, "2026-09-24").body).toBe(
      "Amanhã às 14:30 · Clínica",
    );
    expect(reminderMessage({ ...reminder, allDay: true, startTime: null }, "2026-09-18").body).toBe(
      "25/09/2026, dia inteiro",
    );
  });
});
