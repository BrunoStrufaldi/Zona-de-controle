import { startupStateLabels } from "@/features/system/system-settings/domain/settings";
import {
  type SettingsFinding,
  type StartupItem,
  type TweakKind,
  type TweakRequest,
  type TweakResult,
  type TweakValue,
} from "@/features/system/system-settings/types";

/** Uma mudança marcada na tela, com o valor atual e o novo para a confirmação. */
export interface PendingChange {
  /** Única por item (um item só entra uma vez). */
  key: string;
  request: TweakRequest;
  label: string;
  from: string;
  to: string;
}

export const tweakKindLabels: Record<TweakKind, string> = {
  powerPlan: "Plano de energia",
  gameMode: "Modo de Jogo",
  startupItem: "Inicialização",
};

export function tweakValueLabel(value: TweakValue): string {
  switch (value.type) {
    case "powerPlan":
      return value.name;
    case "gameMode":
      if (value.value === null) return "Ligado (padrão do Windows)";
      return value.value === 0 ? "Desligado" : "Ligado";
    case "startupApproval":
      return value.enabled ? "Ligado" : "Desligado";
  }
}

/** Ajuste que resolve um achado; `null` se o achado não tem ajuste pelo app. */
export function findingChange(finding: SettingsFinding): PendingChange | null {
  switch (finding.kind) {
    case "powerPlan":
      return {
        key: "powerPlan",
        request: { kind: "powerPlan", guid: finding.suggestedGuid },
        label: "Plano de energia",
        from: finding.current ?? "não identificado",
        to: finding.suggestedName,
      };
    case "gameModeOff":
      return {
        key: "gameMode",
        request: { kind: "gameMode" },
        label: "Modo de Jogo",
        from: "Desligado",
        to: "Ligado",
      };
    case "pendingReboot":
      return null;
  }
}

/** Ligar ou desligar um programa da inicialização; `null` se o app não pode mexer nele. */
export function startupChange(item: StartupItem): PendingChange | null {
  if (!item.editable || item.state === "unknown") return null;
  const enabled = item.state !== "enabled";
  return {
    key: item.id,
    request: {
      kind: "startupItem",
      location: item.location,
      name: item.name,
      enabled,
    },
    label: `${item.name} (inicialização)`,
    from: startupStateLabels[item.state],
    to: enabled ? "Ligado" : "Desligado",
  };
}

export interface ResultSummary {
  applied: number;
  unchanged: number;
  failed: Extract<TweakResult, { status: "failed" }>[];
}

export function summarizeResults(results: TweakResult[]): ResultSummary {
  const summary: ResultSummary = { applied: 0, unchanged: 0, failed: [] };
  for (const result of results) {
    if (result.status === "applied") summary.applied += 1;
    else if (result.status === "unchanged") summary.unchanged += 1;
    else summary.failed.push(result);
  }
  return summary;
}

/** Notas da confirmação: reversível, auditado, sem administrador. */
export const TWEAK_CONFIRMATION_NOTES = [
  "O app guarda o valor atual de cada um: dá para desfazer em “Ajustes feitos pelo app”.",
  "Programas da inicialização mudam do mesmo jeito que pelo Gerenciador de Tarefas; nada é desinstalado.",
  "Cada ajuste (e qualquer falha) fica no log de auditoria.",
] as const;
