import { priorityRank } from "@/features/productivity/tasks/domain/labels";
import {
  TASK_STATUSES,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/features/productivity/tasks/types";

export type StatusFilter = "open" | "all" | TaskStatus;
export type PriorityFilter = "all" | TaskPriority;

export interface TaskFilters {
  search: string;
  status: StatusFilter;
  priority: PriorityFilter;
  /** Tag selecionada, ou `null` para todas. */
  tag: string | null;
}

export const DEFAULT_TASK_FILTERS: TaskFilters = {
  search: "",
  status: "open",
  priority: "all",
  tag: null,
};

/** Remove acentos e caixa para comparar texto de busca. */
function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function matchesStatus(task: Task, status: StatusFilter): boolean {
  if (status === "all") return true;
  if (status === "open") return task.status !== "done";
  return task.status === status;
}

function matchesSearch(task: Task, search: string): boolean {
  const query = normalizeText(search.trim());
  if (query === "") return true;
  const haystack = normalizeText([task.title, task.description, ...task.tags].join(" "));
  return haystack.includes(query);
}

/**
 * Aplica os filtros. `ignoreStatus` é usado no Kanban, onde o status já é
 * representado pelas colunas.
 */
export function filterTasks(
  tasks: readonly Task[],
  filters: TaskFilters,
  { ignoreStatus = false }: { ignoreStatus?: boolean } = {},
): Task[] {
  return tasks.filter(
    (task) =>
      (ignoreStatus || matchesStatus(task, filters.status)) &&
      (filters.priority === "all" || task.priority === filters.priority) &&
      (filters.tag === null || task.tags.includes(filters.tag)) &&
      matchesSearch(task, filters.search),
  );
}

export function hasActiveFilters(filters: TaskFilters): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.status !== DEFAULT_TASK_FILTERS.status ||
    filters.priority !== "all" ||
    filters.tag !== null
  );
}

/**
 * Ordem da lista: abertas antes das concluídas; depois vencimento mais
 * próximo (sem data por último), maior prioridade e posição.
 */
export function compareForList(a: Task, b: Task): number {
  const doneDiff = Number(a.status === "done") - Number(b.status === "done");
  if (doneDiff !== 0) return doneDiff;

  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }

  const priorityDiff = priorityRank[b.priority] - priorityRank[a.priority];
  if (priorityDiff !== 0) return priorityDiff;
  return a.position - b.position;
}

export function sortForList(tasks: readonly Task[]): Task[] {
  return [...tasks].sort(compareForList);
}

export type TaskColumns = Record<TaskStatus, Task[]>;

/** Agrupa por status (colunas do Kanban), cada coluna ordenada pela posição. */
export function groupByStatus(tasks: readonly Task[]): TaskColumns {
  const columns = Object.fromEntries(
    TASK_STATUSES.map((status) => [status, [] as Task[]]),
  ) as TaskColumns;
  for (const task of tasks) columns[task.status].push(task);
  for (const status of TASK_STATUSES) {
    columns[status].sort((a, b) => a.position - b.position || a.id - b.id);
  }
  return columns;
}
