import { describe, expect, it } from "vitest";

import {
  applyHabitToggle,
  describeSchedule,
  isDayComplete,
  isMarkable,
  todayProgress,
  toRoutineInput,
  validateRoutineInput,
} from "@/features/productivity/routines/domain/routines";
import { type Routine, type RoutineDay } from "@/features/productivity/routines/types";

function day(overrides: Partial<RoutineDay> = {}): RoutineDay {
  return {
    date: "2026-09-25",
    scheduled: true,
    habitIds: [1, 2],
    completedHabitIds: [],
    ...overrides,
  };
}

function routine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 1,
    name: "Manhã",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    startDate: "2026-09-01",
    habits: [
      { id: 1, name: "Água" },
      { id: 2, name: "Alongar" },
    ],
    recentDays: [day({ date: "2026-09-24" }), day({ completedHabitIds: [1] })],
    currentStreak: 0,
    bestStreak: 0,
    consistency: null,
    ...overrides,
  };
}

describe("agenda", () => {
  it("descreve os dias da semana", () => {
    expect(describeSchedule([0, 1, 2, 3, 4, 5, 6])).toBe("Todo dia");
    expect(describeSchedule([5, 1, 2, 3, 4])).toBe("Dias úteis");
    expect(describeSchedule([6, 0])).toBe("Fins de semana");
    expect(describeSchedule([5, 1, 3])).toBe("seg, qua, sex");
  });
});

describe("progresso do dia", () => {
  it("calcula hoje e dias completos", () => {
    expect(todayProgress(routine())).toEqual({ scheduled: true, done: 1, total: 2 });
    expect(isDayComplete(day({ completedHabitIds: [1, 2] }))).toBe(true);
    expect(isDayComplete(day({ completedHabitIds: [1] }))).toBe(false);
    // Marcação de hábito que não valia no dia não conta.
    expect(isDayComplete(day({ habitIds: [1], completedHabitIds: [2] }))).toBe(false);
    expect(isDayComplete(day({ scheduled: false, completedHabitIds: [1, 2] }))).toBe(false);
  });

  it("só permite marcar dias da agenda em que o hábito valia", () => {
    expect(isMarkable(day(), 1)).toBe(true);
    expect(isMarkable(day({ scheduled: false }), 1)).toBe(false);
    expect(isMarkable(day({ habitIds: [2] }), 1)).toBe(false);
  });

  it("marca e desmarca localmente", () => {
    const [marked] = applyHabitToggle([routine()], 2, "2026-09-25", true);
    expect(todayProgress(marked as Routine)).toEqual({ scheduled: true, done: 2, total: 2 });
    const [unmarked] = applyHabitToggle([marked as Routine], 1, "2026-09-25", false);
    expect(todayProgress(unmarked as Routine).done).toBe(1);
  });
});

describe("formulário", () => {
  it("começa com todos os dias e um hábito vazio", () => {
    expect(toRoutineInput(null)).toEqual({
      name: "",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      habits: [{ id: null, name: "" }],
    });
    expect(toRoutineInput(routine()).habits).toEqual([
      { id: 1, name: "Água" },
      { id: 2, name: "Alongar" },
    ]);
  });

  it("valida nome, dias e hábitos", () => {
    const existing = [routine()];
    const valid = { name: "Noite", weekdays: [1], habits: [{ id: null, name: "Ler" }] };
    expect(validateRoutineInput(valid, existing, null)).toEqual({});
    expect(validateRoutineInput({ ...valid, name: "manhã" }, existing, null).name).toMatch(
      /Já existe/,
    );
    // Editando a própria rotina, o nome pode continuar igual.
    expect(validateRoutineInput({ ...valid, name: "Manhã" }, existing, 1)).toEqual({});
    expect(validateRoutineInput({ ...valid, weekdays: [] }, existing, null).weekdays).toBeDefined();
    expect(
      validateRoutineInput({ ...valid, habits: [{ id: null, name: " " }] }, existing, null).habits,
    ).toBeDefined();
  });
});
