import { type ModuleInfo } from "@/types/module";

export const systemModules = {
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
