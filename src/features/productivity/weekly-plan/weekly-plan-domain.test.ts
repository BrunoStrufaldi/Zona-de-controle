import { describe, expect, it } from "vitest";

import {
  allDayBlocksOn,
  blockTimeLabel,
  draftOf,
  gridRange,
  newDraft,
  nextStartLabel,
  nowAndNext,
  timedBlocksOn,
  toPlanInput,
  validateDraft,
  weekdaysLabel,
} from "@/features/productivity/weekly-plan/domain/plan";
import { type PlanBlock } from "@/features/productivity/weekly-plan/types";

function block(
  id: number,
  title: string,
  weekdays: number[],
  span: [string, string] | null,
): PlanBlock {
  return {
    id,
    title,
    notes: "",
    weekdays,
    startTime: span?.[0] ?? null,
    endTime: span?.[1] ?? null,
    color: "blue",
  };
}

const WEEKDAYS = [1, 2, 3, 4, 5];
/** Parte da planilha: trabalho, academia (seg), faculdade e o fim de semana. */
const PLAN: PlanBlock[] = [
  block(1, "Trabalho", WEEKDAYS, ["08:00", "15:30"]),
  block(2, "Academia", [1], ["15:30", "17:30"]),
  block(3, "Faculdade", WEEKDAYS, ["18:30", "22:30"]),
  block(4, "Acordar/Pular corda", [2, 4], ["06:00", "06:30"]),
  block(5, "Estudar pelo menos 1h", [6], null),
];

/** 28/09/2026 é uma segunda-feira. */
function at(day: number, time: string): Date {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return new Date(2026, 8, 27 + day, hours, minutes);
}

describe("planejamento semanal", () => {
  it("separa os blocos do dia em horário e dia inteiro", () => {
    expect(timedBlocksOn(PLAN, 1).map((b) => b.title)).toEqual([
      "Trabalho",
      "Academia",
      "Faculdade",
    ]);
    expect(timedBlocksOn(PLAN, 2)[0]?.title).toBe("Acordar/Pular corda");
    expect(allDayBlocksOn(PLAN, 6).map((b) => b.title)).toEqual(["Estudar pelo menos 1h"]);
    expect(blockTimeLabel(PLAN[0] as PlanBlock)).toBe("08:00–15:30");
    expect(blockTimeLabel(PLAN[4] as PlanBlock)).toBe("Dia inteiro");
  });

  it("mostra na grade as horas inteiras que cabem todos os blocos", () => {
    expect(gridRange([])).toEqual({ start: 6 * 60, end: 22 * 60 });
    expect(gridRange(PLAN)).toEqual({ start: 6 * 60, end: 23 * 60 });
    expect(gridRange([block(9, "Cedo", [1], ["05:15", "05:45"])])).toEqual({
      start: 5 * 60,
      end: 22 * 60,
    });
  });

  it("resume os dias escolhidos", () => {
    expect(weekdaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe("Todos os dias");
    expect(weekdaysLabel([5, 4, 3, 2, 1])).toBe("Seg a sex");
    expect(weekdaysLabel([6, 0])).toBe("Fim de semana");
    expect(weekdaysLabel([0, 1, 3])).toBe("seg, qua, dom");
  });

  it("encontra o bloco de agora e o próximo", () => {
    const monday = at(1, "16:00");
    expect(nowAndNext(PLAN, monday)).toMatchObject({
      current: { title: "Academia" },
      next: { block: { title: "Faculdade" }, daysAhead: 0 },
    });
    expect(nextStartLabel(PLAN[2] as never, 0, monday)).toBe("às 18:30");

    // Entre blocos: nada agora; o fim de um bloco não conta como "agora".
    expect(nowAndNext(PLAN, at(1, "17:30")).current).toBeNull();

    // Depois da faculdade de segunda: acordar na terça.
    const late = nowAndNext(PLAN, at(1, "23:00"));
    expect(late.current).toBeNull();
    expect(late.next).toMatchObject({ block: { title: "Acordar/Pular corda" }, daysAhead: 1 });
    expect(nextStartLabel(late.next?.block as never, 1, at(1, "23:00"))).toBe("amanhã às 06:00");

    // Sábado à noite: o próximo é o trabalho de segunda.
    const saturday = nowAndNext(PLAN, at(6, "20:00"));
    expect(saturday.next).toMatchObject({ block: { title: "Trabalho" }, daysAhead: 2 });
    expect(nextStartLabel(saturday.next?.block as never, 2, at(6, "20:00"))).toBe(
      "segunda-feira às 08:00",
    );
  });

  it("uma semana à frente, volta ao mesmo bloco se ele for o único", () => {
    const only = [block(1, "Natação", [3], ["07:00", "08:00"])];
    const result = nowAndNext(only, at(3, "09:00"));
    expect(result.next).toMatchObject({ block: { title: "Natação" }, daysAhead: 7 });
    expect(nowAndNext([], at(3, "09:00"))).toEqual({ current: null, next: null });
  });

  it("valida o formulário como o Rust e monta a entrada", () => {
    const draft = newDraft(3, 16 * 60 + 30);
    expect(draft).toMatchObject({
      weekdays: [3],
      allDay: false,
      startTime: "16:30",
      endTime: "17:30",
    });
    expect(newDraft(6, null).allDay).toBe(true);
    expect(newDraft(null, null)).toMatchObject({ weekdays: [], allDay: false });

    expect(validateDraft({ ...draft, title: " " }).title).toBe("Informe o título.");
    expect(validateDraft({ ...draft, title: "x", weekdays: [] }).weekdays).toBeDefined();
    expect(validateDraft({ ...draft, title: "x", endTime: "16:00" }).time).toBe(
      "O fim precisa ser depois do início (no mesmo dia).",
    );
    expect(validateDraft({ ...draft, title: "x", allDay: true, endTime: "16:00" })).toEqual({});

    expect(
      toPlanInput({ ...draft, title: " Inglês ", notes: " ", weekdays: [5, 3], allDay: true }),
    ).toEqual({
      title: "Inglês",
      notes: "",
      weekdays: [3, 5],
      startTime: null,
      endTime: null,
      color: "blue",
    });
    expect(draftOf(PLAN[4] as PlanBlock)).toMatchObject({ allDay: true, weekdays: [6] });
  });
});
