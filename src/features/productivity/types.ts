import { type IsoDate, type IsoDateTime } from "@/types/common";

/**
 * Contratos do módulo de Produtividade (Fase 2).
 * Ainda não há persistência — estes tipos orientam a implementação futura.
 */

export type TaskStatus = "todo" | "in_progress" | "done" | "archived";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  categoryId?: string;
  tags: readonly string[];
  dueDate?: IsoDate;
  /** Regra de recorrência (formato a definir; ex.: RRULE). */
  recurrence?: string;
  checklist: readonly ChecklistItem[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Note {
  id: string;
  title: string;
  /** Conteúdo em Markdown. */
  content: string;
  folderId?: string;
  tags: readonly string[];
  favorite: boolean;
  /** Entradas de diário são notas vinculadas a uma data. */
  journalDate?: IsoDate;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type RoutineFrequency = "daily" | "weekly";

export interface Routine {
  id: string;
  name: string;
  frequency: RoutineFrequency;
  /** Dias da semana (0 = domingo) para rotinas semanais. */
  weekdays?: readonly number[];
  habits: readonly { id: string; label: string }[];
}

export interface RoutineExecution {
  routineId: string;
  date: IsoDate;
  completedHabitIds: readonly string[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: IsoDateTime;
  endsAt?: IsoDateTime;
  allDay: boolean;
  recurrence?: string;
  /** Minutos antes do início para o lembrete local. */
  reminderMinutes?: number;
}

export type CalendarView = "month" | "week" | "day";

/** Versão resumida de uma tarefa com vencimento. */
export type TaskPreview = Pick<Task, "id" | "title" | "priority"> & { dueDate: IsoDate };

/** Resumo de tarefas exibido no dashboard. */
export interface TasksOverview {
  completedToday: number;
  plannedToday: number;
  overdue: number;
  upcoming: readonly TaskPreview[];
}

/** Progresso de uma rotina no dia, exibido no dashboard. */
export interface RoutineProgressSummary {
  name: string;
  completedHabits: number;
  totalHabits: number;
  streakDays: number;
}
