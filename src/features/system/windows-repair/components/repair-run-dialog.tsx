import {
  Circle,
  CircleCheck,
  CircleSlash,
  LoaderCircle,
  OctagonAlert,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  cancelBlocked,
  describeResult,
  outcomeLabels,
  resultIsProblem,
  stepLabels,
} from "@/features/system/windows-repair/domain/repair";
import { type RepairRunState } from "@/features/system/windows-repair/hooks/use-windows-repair";
import {
  type RepairReport,
  type StepProgress,
  type StepResult,
} from "@/features/system/windows-repair/types";
import { useNow } from "@/hooks/use-now";
import { formatDuration, formatNumber } from "@/lib/format";

interface RepairRunDialogProps {
  state: RepairRunState;
  onCancel: () => void;
  onClose: () => void;
}

/** Andamento do reparo e, no fim, o resultado de cada passo. */
export function RepairRunDialog({ state, onCancel, onClose }: RepairRunDialogProps) {
  return (
    <AlertDialog
      open={state.phase !== "idle"}
      onOpenChange={(open) => {
        // Enquanto roda, não fecha (nem com Esc).
        if (!open && state.phase !== "running") onClose();
      }}
    >
      <AlertDialogContent className="max-w-2xl">
        {state.phase === "running" && <RunningView state={state} onCancel={onCancel} />}
        {state.phase === "done" && <ReportView report={state.report} onClose={onClose} />}
        {state.phase === "error" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <TriangleAlert className="size-5 text-danger" aria-hidden="true" />O reparo não foi
                feito
              </AlertDialogTitle>
              <AlertDialogDescription data-selectable>{state.error.message}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="secondary" onClick={onClose}>
                Fechar
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function StepIcon({ step }: { step: StepProgress }) {
  if (step.state === "running") {
    return <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />;
  }
  if (step.state === "pending" || !step.result) {
    return <Circle className="size-4 text-subtle-foreground" aria-hidden="true" />;
  }
  return <ResultIcon result={step.result} />;
}

function ResultIcon({ result }: { result: StepResult }) {
  if (resultIsProblem(result)) {
    return <OctagonAlert className="size-4 text-danger" aria-hidden="true" />;
  }
  if (result.status === "cancelled" || result.status === "skipped") {
    return <CircleSlash className="size-4 text-muted-foreground" aria-hidden="true" />;
  }
  return <CircleCheck className="size-4 text-success" aria-hidden="true" />;
}

function RunningView({
  state,
  onCancel,
}: {
  state: Extract<RepairRunState, { phase: "running" }>;
  onCancel: () => void;
}) {
  const now = useNow(1_000);
  const { progress, cancelRequested } = state;
  const waiting = !progress || progress.phase === "waitingElevation";
  const elapsed = progress ? (now.getTime() - progress.startedAtMs) / 1000 : 0;
  const sfcRunning = progress ? cancelBlocked(progress) : false;

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {cancelRequested ? "Cancelando…" : waiting ? "Aguardando a permissão…" : "Reparando…"}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {waiting
            ? "Responda à janela do Windows (UAC) pedindo permissão de administrador."
            : `Pode levar de 10 a 30 minutos. Tempo até agora: ${formatDuration(elapsed)}.`}
        </AlertDialogDescription>
      </AlertDialogHeader>

      {progress && !waiting && (
        <ol className="grid gap-3" aria-label="Andamento do reparo">
          {progress.steps.map((step) => (
            <li key={step.step} className="grid gap-1.5">
              <div className="flex items-center gap-2 text-sm">
                <StepIcon step={step} />
                <span
                  className={step.state === "pending" ? "text-muted-foreground" : "font-medium"}
                >
                  {stepLabels[step.step]}
                </span>
                {step.state === "running" && step.percent !== null && (
                  <span className="ml-auto font-mono text-xs text-muted-foreground tabular">
                    {formatNumber(step.percent, 1)}%
                  </span>
                )}
              </div>
              {step.state === "running" && (
                <Progress
                  value={step.percent ?? 0}
                  aria-label={`Andamento: ${stepLabels[step.step]}`}
                />
              )}
              {step.result && (
                <p className="pl-6 text-xs text-muted-foreground">{describeResult(step.result)}</p>
              )}
            </li>
          ))}
        </ol>
      )}

      <AlertDialogFooter className="items-center">
        {sfcRunning && (
          <span className="mr-auto text-xs text-muted-foreground">
            O SFC não pode ser interrompido com segurança: o cancelamento vale ao fim dele.
          </span>
        )}
        <Button
          variant="secondary"
          disabled={cancelRequested || waiting || sfcRunning}
          onClick={onCancel}
        >
          Cancelar reparo
        </Button>
      </AlertDialogFooter>
    </>
  );
}

function ReportView({ report, onClose }: { report: RepairReport; onClose: () => void }) {
  const ok = report.outcome === "success";
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle className="flex items-center gap-2">
          {ok ? (
            <CircleCheck className="size-5 text-success" aria-hidden="true" />
          ) : (
            <TriangleAlert className="size-5 text-warning" aria-hidden="true" />
          )}
          Reparo: {outcomeLabels[report.outcome].toLowerCase()}
        </AlertDialogTitle>
        {report.error && (
          <AlertDialogDescription data-selectable>{report.error}</AlertDialogDescription>
        )}
      </AlertDialogHeader>
      {report.steps.length > 0 && (
        <ul className="grid gap-2" aria-label="Resultado de cada passo">
          {report.steps.map(({ step, result }) => (
            <li key={step} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5">
                <ResultIcon result={result} />
              </span>
              <span className="grid gap-0.5">
                <span className="font-medium">{stepLabels[step]}</span>
                <span className="text-muted-foreground" data-selectable>
                  {describeResult(result)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {report.restartRequired && (
        <p className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
          <RotateCcw className="size-4 shrink-0 text-warning" aria-hidden="true" />
          Reinicie o computador para concluir o reparo.
        </p>
      )}
      <AlertDialogFooter>
        <Button onClick={onClose}>Fechar</Button>
      </AlertDialogFooter>
    </>
  );
}
