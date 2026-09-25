import {
  type Routine,
  type RoutineDay,
  type RoutineInput,
} from "@/features/productivity/routines/types";
import { weekdayShort } from "@/lib/weekdays";

/** Limites espelhados de `src-tauri/src/domain/routines.rs`. */
export const ROUTINE_LIMITS = { nameChars: 80, habits: 20, routines: 50 } as const;

/** "Todo dia", "Dias úteis", "Fins de semana" ou a lista (ex.: "seg, qua, sex"). */
export function describeSchedule(weekdays: readonly number[]): string {
  const days = [...new Set(weekdays)].sort((a, b) => a - b);
  const key = days.join(",");
  if (key === "0,1,2,3,4,5,6") return "Todo dia";
  if (key === "1,2,3,4,5") return "Dias úteis";
  if (key === "0,6") return "Fins de semana";
  return days.map(weekdayShort).join(", ");
}

export interface DayProgress {
  scheduled: boolean;
  done: number;
  total: number;
}

export function dayProgress(day: RoutineDay): DayProgress {
  return {
    scheduled: day.scheduled,
    done: day.completedHabitIds.filter((id) => day.habitIds.includes(id)).length,
    total: day.habitIds.length,
  };
}

/** Progresso de hoje (o último dia recente). */
export function todayProgress(routine: Routine): DayProgress {
  const today = routine.recentDays.at(-1);
  return today ? dayProgress(today) : { scheduled: false, done: 0, total: 0 };
}

/** Dia completo: programado, com hábitos, todos feitos. */
export function isDayComplete(day: RoutineDay): boolean {
  const progress = dayProgress(day);
  return progress.scheduled && progress.total > 0 && progress.done === progress.total;
}

/** O hábito pode ser marcado neste dia (dia da agenda em que ele valia)? */
export function isMarkable(day: RoutineDay, habitId: number): boolean {
  return day.scheduled && day.habitIds.includes(habitId);
}

/** Marca/desmarca localmente (atualização otimista, antes da resposta do backend). */
export function applyHabitToggle(
  routines: readonly Routine[],
  habitId: number,
  date: string,
  done: boolean,
): Routine[] {
  return routines.map((routine) =>
    routine.habits.some((habit) => habit.id === habitId)
      ? {
          ...routine,
          recentDays: routine.recentDays.map((day) =>
            day.date !== date
              ? day
              : {
                  ...day,
                  completedHabitIds: done
                    ? [...new Set([...day.completedHabitIds, habitId])]
                    : day.completedHabitIds.filter((id) => id !== habitId),
                },
          ),
        }
      : routine,
  );
}

/** Dados iniciais do formulário. */
export function toRoutineInput(routine: Routine | null): RoutineInput {
  if (routine === null) {
    return { name: "", weekdays: [0, 1, 2, 3, 4, 5, 6], habits: [{ id: null, name: "" }] };
  }
  return {
    name: routine.name,
    weekdays: [...routine.weekdays],
    habits: routine.habits.map(({ id, name }) => ({ id, name })),
  };
}

export type RoutineInputErrors = Partial<Record<keyof RoutineInput, string>>;

function collapseSpaces(value: string): string {
  return value.trim().split(/\s+/).join(" ");
}

/** Validação para feedback imediato (o backend é a fonte da verdade). */
export function validateRoutineInput(
  input: RoutineInput,
  existing: readonly Routine[],
  editingId: number | null,
): RoutineInputErrors {
  const errors: RoutineInputErrors = {};
  const name = collapseSpaces(input.name);
  if (name === "") errors.name = "Informe um nome.";
  else if (name.length > ROUTINE_LIMITS.nameChars)
    errors.name = `Use no máximo ${ROUTINE_LIMITS.nameChars} caracteres.`;
  else if (
    existing.some(
      (routine) => routine.id !== editingId && routine.name.toLowerCase() === name.toLowerCase(),
    )
  )
    errors.name = `Já existe uma rotina chamada “${name}”.`;

  if (input.weekdays.length === 0) errors.weekdays = "Escolha pelo menos um dia.";

  const habits = input.habits.filter((habit) => habit.name.trim() !== "");
  if (habits.length === 0) errors.habits = "Adicione pelo menos um hábito.";
  else if (habits.length > ROUTINE_LIMITS.habits)
    errors.habits = `Use no máximo ${ROUTINE_LIMITS.habits} hábitos.`;
  else if (habits.some((habit) => collapseSpaces(habit.name).length > ROUTINE_LIMITS.nameChars))
    errors.habits = `Cada hábito pode ter no máximo ${ROUTINE_LIMITS.nameChars} caracteres.`;

  return errors;
}
