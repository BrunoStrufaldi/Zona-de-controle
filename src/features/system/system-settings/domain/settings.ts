import {
  type FindingLevel,
  type GpuScheduling,
  type PackagedState,
  type PowerStatus,
  type SettingsFinding,
  type StartupLocation,
  type StartupReport,
  type StartupState,
} from "@/features/system/system-settings/types";

/** Texto exibido quando uma leitura não está disponível (nunca um valor estimado). */
export const NOT_AVAILABLE = "Não disponível";

export const levelLabels: Record<FindingLevel, string> = {
  suggestion: "Sugestão",
  attention: "Atenção",
  critical: "Crítico",
};

/** Tópicos do passo a passo da BIOS (ver `domain/hardware.ts`). */
export type GuideTopic = "biosUpdate" | "memoryProfile" | "secureBoot" | "tpm";

export interface FindingText {
  title: string;
  detail: string;
  recommendation: string;
  /** Passo a passo na BIOS, quando a solução é lá. */
  guide?: GuideTopic;
}

/** Caminho no Windows para trocar o plano de energia (o Windows 11 não tem em Configurações). */
const POWER_OPTIONS_PATH = "Painel de Controle > Hardware e Sons > Opções de Energia";

/** Título, dados e recomendação de um achado das configurações do Windows. */
export function describeSettingsFinding(finding: SettingsFinding): FindingText {
  switch (finding.kind) {
    case "pendingReboot": {
      const sources = [
        finding.windowsUpdate && "o Windows Update instalou atualizações",
        finding.servicing && "a manutenção de componentes do Windows está esperando",
      ].filter(Boolean);
      return {
        title: "Reinício pendente",
        detail: `O Windows precisa reiniciar: ${sources.join(" e ")}.`,
        recommendation:
          "Salve o que estiver aberto e reinicie o computador para concluir. Antes de um reparo do Windows (DISM/SFC), reinicie primeiro: com o reinício pendente o reparo costuma falhar.",
      };
    }
    case "powerPlan":
      return {
        title: `Usar o plano “${finding.suggestedName}”`,
        detail: `Atual: ${finding.current ?? "não identificado"} → sugerido: ${finding.suggestedName}`,
        recommendation: `Mantém o processador pronto para trabalhar em velocidade alta, com menos atraso em jogos e tarefas pesadas, em troca de um pouco mais de consumo de energia.${
          finding.hasBattery ? " No notebook, a bateria dura menos." : ""
        } Para trocar: ${POWER_OPTIONS_PATH}.`,
      };
    case "gameModeOff":
      return {
        title: "Modo de Jogo desligado",
        detail: "Configurações > Jogos > Modo de Jogo",
        recommendation:
          "Com ele ligado, o Windows dá prioridade ao jogo aberto e evita instalar atualizações e mostrar notificações durante a partida.",
      };
  }
}

/** Nome do plano ativo como o Windows mostra (com Modern Standby, os planos não se aplicam). */
export function activePlanLabel(power: PowerStatus): string {
  if (power.modernStandby) return "Modos de energia (Modern Standby)";
  return power.plans.find((plan) => plan.active)?.name ?? NOT_AVAILABLE;
}

export function gpuSchedulingLabel(gpu: GpuScheduling): string {
  if (!gpu.supported) return "Não suportado pela placa ou pelo driver";
  return gpu.enabled ? "Ligado" : "Desligado";
}

export const startupLocationLabels: Record<StartupLocation, string> = {
  userRun: "Registro do usuário",
  userStartupFolder: "Pasta Inicializar",
  machineRun: "Registro da máquina",
  machineRun32: "Registro da máquina (32 bits)",
  commonStartupFolder: "Pasta Inicializar (todos os usuários)",
};

export const startupStateLabels: Record<StartupState, string> = {
  enabled: "Ligado",
  disabled: "Desligado",
  unknown: "Estado desconhecido",
};

export const packagedStateLabels: Record<PackagedState, string> = {
  enabled: "Ligado",
  disabled: "Desligado",
  disabledByUser: "Desligado",
  disabledByPolicy: "Bloqueado por política",
  enabledByPolicy: "Ligado por política",
  unknown: "Estado desconhecido",
};

export function packagedEnabled(state: PackagedState): boolean {
  return state === "enabled" || state === "enabledByPolicy";
}

export interface StartupCounts {
  enabled: number;
  disabled: number;
}

/** Programas ligados e desligados (itens do registro/pastas + apps da Store). */
export function startupCounts(report: StartupReport): StartupCounts {
  let enabled = 0;
  let disabled = 0;
  for (const item of report.items) {
    if (item.state === "enabled") enabled += 1;
    else if (item.state === "disabled") disabled += 1;
  }
  for (const task of report.packaged) {
    if (packagedEnabled(task.state)) enabled += 1;
    else if (task.state !== "unknown") disabled += 1;
  }
  return { enabled, disabled };
}
