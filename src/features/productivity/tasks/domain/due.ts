import { type Task } from "@/features/productivity/tasks/types";
import { daysBetween } from "@/lib/dates";
import { type IsoDate } from "@/types/common";

/** Situação do vencimento de uma tarefa em relação a hoje. */
export type DueState = "none" | "completed" | "overdue" | "today" | "soon" | "later";

/** Dias à frente considerados "em breve". */
export const SOON_WINDOW_DAYS = 3;

export function getDueState(task: Pick<Task, "dueDate" | "status">, today: IsoDate): DueState {
  if (task.status === "done") return "completed";
  if (task.dueDate === null) return "none";

  const days = daysBetween(today, task.dueDate);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= SOON_WINDOW_DAYS) return "soon";
  return "later";
}

/** Texto curto para o vencimento (ex.: "Hoje", "Amanhã", "Atrasada há 2 dias"). */
export function describeDue(dueDate: IsoDate, today: IsoDate): string {
  const days = daysBetween(today, dueDate);
  if (days === 0) return "Hoje";
  if (days === 1) return "Amanhã";
  if (days === -1) return "Ontem";
  if (days < 0) return `Atrasada há ${-days} dias`;
  return `Em ${days} dias`;
}
