import { type IsoDate, type IsoDateTime } from "@/types/common";

/**
 * Contratos futuros do módulo de Produtividade (Fase 2).
 * Tarefas já implementadas: ver `features/productivity/tasks/types.ts`.
 */

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

/** Progresso de uma rotina no dia, exibido no dashboard. */
export interface RoutineProgressSummary {
  name: string;
  completedHabits: number;
  totalHabits: number;
  streakDays: number;
}
