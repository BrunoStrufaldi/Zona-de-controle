/**
 * DADOS FICTÍCIOS — usados apenas para demonstrar o layout do dashboard.
 *
 * Regras (ver CLAUDE.md):
 *  - Mocks vivem somente em `src/mocks/`.
 *  - Todo componente que exibir estes dados deve mostrar o selo "Demo".
 *  - Nunca apresente estes valores como métricas reais.
 */
import { type ActivityEntry } from "@/types/activity";

export interface DashboardDemoData {
  activity: readonly ActivityEntry[];
}

export const dashboardDemoData: DashboardDemoData = {
  activity: [
    {
      id: "a1",
      module: "productivity",
      description: "Tarefa “Enviar relatório” concluída",
      occurredAt: "2026-09-25T08:45:00-03:00",
    },
    {
      id: "a2",
      module: "finance",
      description: "Lançamento “Internet” marcado como pago",
      occurredAt: "2026-09-24T19:20:00-03:00",
    },
    {
      id: "a3",
      module: "system",
      description: "Alerta: unidade C: acima de 80% de uso",
      occurredAt: "2026-09-24T14:05:00-03:00",
    },
    {
      id: "a4",
      module: "productivity",
      description: "Rotina matinal concluída",
      occurredAt: "2026-09-24T07:30:00-03:00",
    },
  ],
};
