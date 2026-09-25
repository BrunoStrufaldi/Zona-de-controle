import { type IsoDateTime } from "@/types/common";

export type ActivityModule = "productivity" | "system" | "finance";

/** Entrada do feed de atividades recentes (agrega eventos de todos os módulos). */
export interface ActivityEntry {
  id: string;
  module: ActivityModule;
  description: string;
  occurredAt: IsoDateTime;
}
