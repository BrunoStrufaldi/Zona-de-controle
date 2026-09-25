import { type IsoDate, type IsoDateTime } from "@/types/common";

/**
 * Contrato de Tarefas. Espelha `src-tauri/src/domain/tasks.rs` — mantenha os
 * dois em sincronia.
 */

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Da menor para a maior prioridade. */
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

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
  completedAt: IsoDateTime | null;
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
