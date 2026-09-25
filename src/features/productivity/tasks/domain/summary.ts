import { priorityRank } from "@/features/productivity/tasks/domain/labels";
import {
  type Task,
  type TaskPreview,
  type TasksOverview,
} from "@/features/productivity/tasks/types";
import { toIsoDate } from "@/lib/dates";

const UPCOMING_LIMIT = 3;

/**
 * Resumo do dia para o dashboard, calculado na data local de `now`:
 * - concluídas hoje: `completedAt` cai hoje (horário local);
 * - planejadas hoje: em aberto vencendo hoje ou atrasadas + concluídas hoje;
 * - próximas: em aberto com vencimento, mais próximas e prioritárias primeiro.
 */
export function summarizeToday(tasks: readonly Task[], now: Date = new Date()): TasksOverview {
  const today = toIsoDate(now);
  const open = tasks.filter((task) => task.status !== "done");

  const completedToday = tasks.filter(
    (task) => task.completedAt !== null && toIsoDate(new Date(task.completedAt)) === today,
  ).length;
  const dueUntilToday = open.filter((task) => task.dueDate !== null && task.dueDate <= today);
  const overdue = dueUntilToday.filter((task) => task.dueDate !== null && task.dueDate < today);

  const upcoming: TaskPreview[] = open
    .filter((task): task is Task & { dueDate: string } => task.dueDate !== null)
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) || priorityRank[b.priority] - priorityRank[a.priority],
    )
    .slice(0, UPCOMING_LIMIT)
    .map(({ id, title, priority, dueDate }) => ({ id, title, priority, dueDate }));

  return {
    completedToday,
    plannedToday: dueUntilToday.length + completedToday,
    overdue: overdue.length,
    upcoming,
  };
}
