import { type ModuleInfo } from "@/types/module";

export const productivityModules = {
  tasks: {
    description: "Organize o que precisa ser feito, do To-Do rápido ao quadro Kanban.",
    phase: 2,
    plannedFeatures: [
      "Lista To-Do e quadro Kanban",
      "Prioridades, categorias, tags e status",
      "Datas de vencimento e recorrência",
      "Checklists dentro das tarefas",
    ],
  },
  notes: {
    description: "Notas rápidas, diário e documentos em Markdown, tudo local.",
    phase: 2,
    plannedFeatures: [
      "Editor Markdown com pré-visualização",
      "Notas rápidas e diário por data",
      "Busca, tags, favoritos e pastas",
      "Histórico de versões",
    ],
  },
  routines: {
    description: "Hábitos e rotinas diárias ou semanais com acompanhamento de consistência.",
    phase: 2,
    plannedFeatures: [
      "Rotinas diárias e semanais",
      "Hábitos com histórico de execução",
      "Indicadores de consistência e sequência",
    ],
  },
  calendar: {
    description: "Eventos e lembretes com notificações locais.",
    phase: 2,
    plannedFeatures: [
      "Visões mensal, semanal e diária",
      "Eventos recorrentes",
      "Lembretes com notificações locais",
    ],
  },
} as const satisfies Record<string, ModuleInfo>;
