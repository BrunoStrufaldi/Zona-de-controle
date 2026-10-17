import { TriangleAlert, Wrench } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import { Button } from "@/components/ui/button";
import { stepDescriptions, stepLabels } from "@/features/system/windows-repair/domain/repair";
import { type RepairReadiness, type RepairStep } from "@/features/system/windows-repair/types";

const STEPS: readonly RepairStep[] = ["checkHealth", "scanHealth", "restoreHealth", "sfc"];

interface RepairCardProps {
  readiness: RepairReadiness;
  busy: boolean;
  onStart: () => void;
}

/** O que o reparo faz, os avisos e o botão para começar. */
export function RepairCard({ readiness, busy, onStart }: RepairCardProps) {
  const unavailable = !readiness.toolsAvailable;
  return (
    <WidgetCard title="Reparo do Windows" icon={Wrench} contentClassName="gap-4">
      <p className="text-sm text-muted-foreground">
        Use quando o Windows estiver com erros estranhos, travando ou falhando em atualizações. O
        reparo usa as ferramentas do próprio Windows, nesta ordem:
      </p>
      <ol className="grid gap-3" aria-label="Passos do reparo">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-start gap-3 text-sm">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-mono text-[10px] text-primary">
              {index + 1}
            </span>
            <span className="grid gap-0.5">
              <span className="font-medium">{stepLabels[step]}</span>
              <span className="text-muted-foreground">{stepDescriptions[step]}</span>
            </span>
          </li>
        ))}
      </ol>

      {readiness.pendingReboot && (
        <p
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"
          role="status"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          Há um reinício pendente do Windows. Reinicie antes: com ele pendente o reparo costuma
          falhar.
        </p>
      )}
      {unavailable && (
        <p className="text-sm text-muted-foreground" role="status">
          Não disponível: as ferramentas de reparo (DISM e SFC) não foram encontradas neste Windows.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-xs text-subtle-foreground">
          Exige administrador e leva de 10 a 30 minutos.
        </span>
        <Button disabled={busy || unavailable || readiness.running} onClick={onStart}>
          <Wrench aria-hidden="true" />
          Reparar o Windows…
        </Button>
      </div>
    </WidgetCard>
  );
}
