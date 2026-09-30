/**
 * Contrato do planejamento semanal fixo (aba da tela Rotinas). Espelha
 * `src-tauri/src/domain/weekly_plan.rs`.
 *
 * Cada bloco se repete nos mesmos dias toda semana. É só um plano: nada é
 * marcado como feito. Blocos com horário não se sobrepõem no mesmo dia
 * (o Rust recusa); anotações do dia inteiro não têm horário.
 */
import { type CategoryColor } from "@/types/palette";

export interface PlanBlock {
  id: number;
  title: string;
  notes: string;
  /** 0 = domingo … 6 = sábado. */
  weekdays: number[];
  /** `HH:MM`; os dois nulos = dia inteiro. */
  startTime: string | null;
  endTime: string | null;
  color: CategoryColor;
}

export interface PlanBlockInput {
  title: string;
  notes: string;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  color: CategoryColor;
}
