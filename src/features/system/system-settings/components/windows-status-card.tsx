import { MonitorCog } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import {
  StatusList,
  type StatusRow,
} from "@/features/system/system-settings/components/status-list";
import {
  activePlanLabel,
  gpuSchedulingLabel,
  NOT_AVAILABLE,
} from "@/features/system/system-settings/domain/settings";
import { type WindowsSettingsReport } from "@/features/system/system-settings/types";

function powerRow(report: WindowsSettingsReport): StatusRow {
  const power = report.power;
  if (!power) return { label: "Plano de energia", value: NOT_AVAILABLE };
  const custom = power.plans.find((plan) => plan.active)?.kind === "custom";
  return {
    label: "Plano de energia",
    value: (
      <span className="inline-flex flex-wrap items-center gap-2">
        {activePlanLabel(power)}
        {custom && <Badge variant="outline">Personalizado</Badge>}
      </span>
    ),
    hint: power.modernStandby
      ? "Este PC usa os modos de energia de Configurações > Sistema > Energia; os planos não se aplicam."
      : `${power.plans.length === 1 ? "1 plano" : `${power.plans.length} planos`} neste PC.`,
  };
}

function gameModeRow(report: WindowsSettingsReport): StatusRow {
  const status = report.gameMode;
  if (!status) return { label: "Modo de Jogo", value: NOT_AVAILABLE };
  return {
    label: "Modo de Jogo",
    value: status.enabled ? "Ligado" : "Desligado",
    hint: status.byDefault ? "Padrão do Windows." : undefined,
  };
}

function gpuRows(report: WindowsSettingsReport): StatusRow[] {
  const label = "Agendamento de GPU acelerado por hardware";
  const gpus = report.gpus;
  if (!gpus || gpus.length === 0) return [{ label, value: NOT_AVAILABLE }];
  const hint =
    "Só leitura. Para mudar: Configurações > Sistema > Tela > Elementos gráficos (exige reiniciar).";
  if (gpus.length === 1 && gpus[0]) {
    return [{ label, value: gpuSchedulingLabel(gpus[0]), hint }];
  }
  return gpus.map((gpu, index) => ({
    label: `${label} · ${gpu.name}`,
    value: gpuSchedulingLabel(gpu),
    hint: index === gpus.length - 1 ? hint : undefined,
  }));
}

function rebootRow(report: WindowsSettingsReport): StatusRow {
  const pending = report.pendingReboot;
  const label = "Reinício pendente";
  if (!pending) return { label, value: NOT_AVAILABLE };
  return { label, value: pending.windowsUpdate || pending.servicing ? "Sim" : "Não" };
}

/** Leituras atuais do Windows (energia, jogos, GPU, atualizações). */
export function WindowsStatusCard({ report }: { report: WindowsSettingsReport }) {
  const gpus = report.gpus;
  return (
    <WidgetCard title="Windows" icon={MonitorCog} contentClassName="gap-4">
      <StatusList
        label="Leituras do Windows"
        rows={[powerRow(report), gameModeRow(report), ...gpuRows(report), rebootRow(report)]}
      />
      {gpus && gpus.length === 1 && gpus[0] && (
        <p className="text-xs text-subtle-foreground">Placa de vídeo: {gpus[0].name}</p>
      )}
    </WidgetCard>
  );
}
