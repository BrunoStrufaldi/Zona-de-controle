import { type Routine, type RoutineInput } from "@/features/productivity/routines/types";
import { invokeCommand } from "@/services/tauri/commands";

/** Rotinas com hábitos, últimos 8 dias e estatísticas (sequência, recorde, consistência). */
export function listRoutines(): Promise<Routine[]> {
  return invokeCommand("list_routines");
}

export function createRoutine(input: RoutineInput): Promise<Routine> {
  return invokeCommand("create_routine", { input });
}

/** Hábitos removidos da lista deixam de valer a partir de hoje (histórico mantido). */
export function updateRoutine(id: number, input: RoutineInput): Promise<Routine> {
  return invokeCommand("update_routine", { id, input });
}

/** Marca/desmarca um hábito em um dia (hoje até 7 dias atrás). Retorna a rotina atualizada. */
export function setHabitDone(habitId: number, date: string, done: boolean): Promise<Routine> {
  return invokeCommand("set_habit_done", { habitId, date, done });
}

/** Exclusão definitiva e auditada (hábitos e histórico). Só após confirmação explícita. */
export async function deleteRoutine(id: number): Promise<void> {
  await invokeCommand("delete_routine", { id });
}
