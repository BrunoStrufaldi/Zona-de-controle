import { type IsoDate, type IsoDateTime } from "@/types/common";

/**
 * Contrato de Tarefas. Espelha `src-tauri/src/domain/tasks.rs`,
 * `task_recurrence.rs` e `task_categories.rs` — mantenha-os em sincronia.
 */

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Da menor para a maior prioridade. */
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

/**
 * Repetição a cada `interval` dias/semanas/meses/anos. Na semanal, `weekdays`
 * (0 = domingo) escolhe os dias; vazio = mesmo dia da semana do vencimento.
 * Ao concluir, a próxima ocorrência é criada e a regra passa para ela.
 */
export interface TaskRecurrence {
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays: number[];
}

export interface ChecklistItem {
  id: number;
  text: string;
  done: boolean;
}

/** Item de checklist no formulário (a lista inteira é substituída ao salvar). */
export interface ChecklistItemInput {
  text: string;
  done: boolean;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: IsoDate | null;
  /** Ordem dentro da coluna do Kanban. */
  position: number;
  tags: string[];
  categoryId: number | null;
  recurrence: TaskRecurrence | null;
  checklist: ChecklistItem[];
  completedAt: IsoDateTime | null;
  /** Preenchida quando arquivada (fora da lista, do Kanban e do dashboard). */
  archivedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Dados de criação/edição (substituição completa). */
export interface TaskInput {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: IsoDate | null;
  tags: string[];
  categoryId: number | null;
  recurrence: TaskRecurrence | null;
  checklist: ChecklistItemInput[];
}

/** Resultado de uma alteração; concluir uma recorrente traz a próxima ocorrência. */
export interface TaskChange {
  task: Task;
  nextOccurrence: Task | null;
}

/** Paleta de categorias; cada cor é um token do tema (`--zdc-category-*`). */
export const CATEGORY_COLORS = [
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
  "slate",
] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export interface TaskCategory {
  id: number;
  name: string;
  color: CategoryColor;
  /** Tarefas (inclusive arquivadas) que usam a categoria. */
  taskCount: number;
}

export interface TaskCategoryInput {
  name: string;
  color: CategoryColor;
}

/** Versão resumida de uma tarefa com vencimento (dashboard). */
export type TaskPreview = Pick<Task, "id" | "title" | "priority"> & { dueDate: IsoDate };

/** Resumo do dia exibido no dashboard. */
export interface TasksOverview {
  /** Concluídas hoje. */
  completedToday: number;
  /** Tarefas do dia: vencendo hoje/atrasadas em aberto + concluídas hoje. */
  plannedToday: number;
  overdue: number;
  upcoming: readonly TaskPreview[];
}
