import { type ModuleInfo } from "@/types/module";

export const systemModules = {
  monitor: {
    description: "Uso de CPU, memória e discos do seu computador em tempo real.",
    phase: 3,
    plannedFeatures: [
      "CPU, RAM e armazenamento em tempo real",
      "Uso por disco e temperatura, quando suportada",
      "Processos relevantes",
      "Informações do sistema",
    ],
  },
  devices: {
    description:
      "Periféricos conectados e nível de bateria, com indicação clara do que pode ou não ser lido.",
    phase: 3,
    plannedFeatures: [
      "Bluetooth com Battery Service padrão",
      "Controles Xbox (XInput / Windows.Gaming.Input)",
      "Periféricos 2.4 GHz via plugins por modelo (somente leitura)",
      "Status de carregamento, tipo de conexão e última atualização",
    ],
  },
  diagnostics: {
    description: "Alertas e recomendações a partir das métricas coletadas.",
    phase: 3,
    plannedFeatures: [
      "Alertas de armazenamento",
      "Recomendações e identificação de problemas",
      "Histórico de métricas",
    ],
  },
  optimization: {
    description:
      "Limpeza segura e transparente: você vê exatamente o que será removido antes de confirmar.",
    phase: 4,
    plannedFeatures: [
      "Análise de arquivos temporários",
      "Caches explicitamente seguros",
      "Lixeira",
      "Confirmação explícita, logs de auditoria e cancelamento",
    ],
  },
} as const satisfies Record<string, ModuleInfo>;
