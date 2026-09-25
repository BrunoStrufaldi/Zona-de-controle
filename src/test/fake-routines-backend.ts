import { vi } from "vitest";

import { type Routine, type RoutineInput } from "@/features/productivity/routines/types";
import { addDays, toIsoDate, weekdayOf } from "@/lib/dates";
import { mockDesktopRuntime } from "@/test/tauri";

/** Rotina inicial: nome, dias, hábitos e marcações (`{ data: [ids] }`). */
export interface RoutineSeed {
  name: string;
  weekdays?: number[];
  habits: string[];
  /** Dias atrás (0 = hoje) → índices dos hábitos feitos. */
  done?: Record<number, number[]>;
  /** Dias atrás em que a rotina começou (padrão: 30). */
  startedDaysAgo?: number;
}

interface StoredRoutine {
  id: number;
  name: string;
  weekdays: number[];
  startDate: string;
  habits: { id: number; name: string }[];
  completions: Set<string>;
}

/**
 * Backend de rotinas em memória para testes de interface. Simplificação: a
 * sequência é contada só nos últimos 8 dias e hábitos removidos somem da grade.
 */
export function mockRoutinesBackend(seeds: RoutineSeed[] = []) {
  const today = toIsoDate(new Date());
  let nextRoutineId = 1;
  let nextHabitId = 1;
  const key = (habitId: number, date: string) => `${habitId}@${date}`;

  let routines: StoredRoutine[] = seeds.map((seed) => {
    const habits = seed.habits.map((name) => ({ id: nextHabitId++, name }));
    const completions = new Set<string>();
    for (const [daysAgo, indexes] of Object.entries(seed.done ?? {})) {
      for (const index of indexes) {
        const habit = habits[index];
        if (habit) completions.add(key(habit.id, addDays(today, -Number(daysAgo))));
      }
    }
    return {
      id: nextRoutineId++,
      name: seed.name,
      weekdays: seed.weekdays ?? [0, 1, 2, 3, 4, 5, 6],
      startDate: addDays(today, -(seed.startedDaysAgo ?? 30)),
      habits,
      completions,
    };
  });

  const view = (stored: StoredRoutine): Routine => {
    const recentDays = Array.from({ length: 8 }, (_, index) => {
      const date = addDays(today, index - 7);
      const scheduled = date >= stored.startDate && stored.weekdays.includes(weekdayOf(date));
      const habitIds = stored.habits.map((habit) => habit.id);
      return {
        date,
        scheduled,
        habitIds,
        completedHabitIds: habitIds.filter((id) => stored.completions.has(key(id, date))),
      };
    });
    let currentStreak = 0;
    for (const day of recentDays) {
      if (!day.scheduled) continue;
      const complete = day.completedHabitIds.length === day.habitIds.length;
      if (complete) currentStreak += 1;
      else if (day.date !== today) currentStreak = 0;
    }
    return {
      id: stored.id,
      name: stored.name,
      weekdays: [...stored.weekdays],
      startDate: stored.startDate,
      habits: stored.habits.map((habit) => ({ ...habit })),
      recentDays,
      currentStreak,
      bestStreak: currentStreak,
      consistency: null,
    };
  };

  const find = (id: number) => {
    const stored = routines.find((routine) => routine.id === id);
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (!stored) throw { kind: "not_found", message: "rotina não encontrada" };
    return stored;
  };

  const handlers = {
    list_routines: vi.fn(() => routines.map(view)),
    create_routine: vi.fn(({ input }: { input: RoutineInput }) => {
      const stored: StoredRoutine = {
        id: nextRoutineId++,
        name: input.name,
        weekdays: [...input.weekdays],
        startDate: today,
        habits: input.habits.map((habit) => ({ id: nextHabitId++, name: habit.name })),
        completions: new Set(),
      };
      routines = [...routines, stored];
      return view(stored);
    }),
    update_routine: vi.fn(({ id, input }: { id: number; input: RoutineInput }) => {
      const stored = find(id);
      stored.name = input.name;
      stored.weekdays = [...input.weekdays];
      stored.habits = input.habits.map((habit) => ({
        id: habit.id ?? nextHabitId++,
        name: habit.name,
      }));
      return view(stored);
    }),
    set_habit_done: vi.fn(
      ({ habitId, date, done }: { habitId: number; date: string; done: boolean }) => {
        const stored = routines.find((routine) =>
          routine.habits.some((habit) => habit.id === habitId),
        );
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        if (!stored) throw { kind: "not_found", message: "hábito não encontrado" };
        if (done) stored.completions.add(key(habitId, date));
        else stored.completions.delete(key(habitId, date));
        return view(stored);
      },
    ),
    delete_routine: vi.fn(({ id }: { id: number }) => {
      find(id);
      routines = routines.filter((routine) => routine.id !== id);
      return null;
    }),
  };

  mockDesktopRuntime(handlers);
  return { handlers, today };
}
