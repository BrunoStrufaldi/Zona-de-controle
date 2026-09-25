import { type IsoDate } from "@/types/common";

/** Contrato de Rotinas. Espelha `src-tauri/src/domain/routines.rs` — mantenha em sincronia. */

export interface Habit {
  id: number;
  name: string;
}

/** Situação de um dia recente (grade de marcação). */
export interface RoutineDay {
  date: IsoDate;
  /** Dia da agenda (dia da semana escolhido, a partir do início da rotina). */
  scheduled: boolean;
  /** Hábitos que valiam naquele dia. */
  habitIds: number[];
  completedHabitIds: number[];
}

export interface Routine {
  id: number;
  name: string;
  /** 0 = domingo … 6 = sábado; os 7 dias = todo dia. */
  weekdays: number[];
  startDate: IsoDate;
  /** Hábitos atuais, na ordem de exibição. */
  habits: Habit[];
  /** De 7 dias atrás até hoje (o último é hoje). */
  recentDays: RoutineDay[];
  currentStreak: number;
  bestStreak: number;
  /** Fração de dias programados completos nos últimos 30 dias; `null` sem dias programados. */
  consistency: number | null;
}

/** Hábito no formulário: com `id` mantém um existente; sem `id`, cria um novo. */
export interface HabitInput {
  id: number | null;
  name: string;
}

export interface RoutineInput {
  name: string;
  weekdays: number[];
  habits: HabitInput[];
}
