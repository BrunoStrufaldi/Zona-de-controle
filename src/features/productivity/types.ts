import { type IsoDateTime } from "@/types/common";

/**
 * Contratos futuros do módulo de Produtividade (Fase 2).
 * Já implementados: `tasks/types.ts`, `notes/types.ts` e `routines/types.ts` (em `features/productivity/`).
 */

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
