import { CircleCheck, CircleSlash, TriangleAlert } from "lucide-react";

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
  NOT_REMOVED_SAMPLE,
  progressPercent,
  removalReasonLabels,
  removedOfLabel,
  reportTotals,
  resultNotes,
  sourceInfo,
} from "@/features/system/optimization/domain/cleanup";
import { type CleanupRunState } from "@/features/system/optimization/hooks/use-cleanup-run";
import { type CleanupReport } from "@/features/system/optimization/types";
import { formatBytes, formatNumber } from "@/lib/format";

interface CleanupRunDialogProps {
  state: CleanupRunState;
  onCancel: () => void;
  /** Fecha depois do resultado (a tela analisa de novo). */
  onClose: () => void;
}

/** Andamento da limpeza e, no fim, o que foi removido e o que ficou. */
export function CleanupRunDialog({ state, onCancel, onClose }: CleanupRunDialogProps) {
  return (
    <AlertDialog
      open={state.phase !== "idle"}
      onOpenChange={(open) => {
        // Enquanto roda, não fecha (nem com Esc): use "Cancelar limpeza".
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
                <TriangleAlert className="size-5 text-danger" aria-hidden="true" />A limpeza não foi
                feita
              </AlertDialogTitle>
              <AlertDialogDescription data-selectable>{state.error.message}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="secondary" onClick={onClose}>
                Fechar e analisar de novo
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RunningView({
  state,
  onCancel,
}: {
  state: Extract<CleanupRunState, { phase: "running" }>;
  onCancel: () => void;
}) {
  const { progress, cancelRequested } = state;
  const current = progress?.currentSource ? sourceInfo[progress.currentSource].name : null;

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{cancelRequested ? "Cancelando…" : "Limpando…"}</AlertDialogTitle>
        <AlertDialogDescription>
          {current ? `Agora: ${current}.` : "Preparando a limpeza."} Arquivos em uso ou alterados
          são pulados.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="grid gap-2">
        <Progress
          value={progress ? progressPercent(progress) : 0}
          aria-label="Andamento da limpeza"
        />
        <p className="text-sm text-muted-foreground tabular-nums" role="status">
          {progress
            ? `${formatNumber(progress.processedItems)} de ${formatNumber(progress.totalItems)} itens · ${formatBytes(progress.removedBytes)} liberados`
            : "Conferindo os itens…"}
        </p>
      </div>
      <AlertDialogFooter>
        <Button variant="secondary" disabled={cancelRequested} onClick={onCancel}>
          <CircleSlash aria-hidden="true" />
          {cancelRequested ? "Cancelando…" : "Cancelar limpeza"}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

function ReportView({ report, onClose }: { report: CleanupReport; onClose: () => void }) {
  const totals = reportTotals(report);

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle className="flex items-center gap-2">
          {report.cancelled ? (
            <CircleSlash className="size-5 text-warning" aria-hidden="true" />
          ) : (
            <CircleCheck className="size-5 text-success" aria-hidden="true" />
          )}
          {report.cancelled ? "Limpeza cancelada" : "Limpeza concluída"}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {formatBytes(totals.removedBytes)} liberados ·{" "}
          {totals.removedCount === 1
            ? "1 item removido"
            : `${formatNumber(totals.removedCount)} itens removidos`}
          . Registrado no log de auditoria.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <ul className="grid gap-2" aria-label="Resultado por local">
        {report.sources.map((result) => (
          <li
            key={result.source}
            className="grid gap-0.5 rounded-md border border-border bg-background/40 p-3"
          >
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{sourceInfo[result.source].name}</span>
              <span className="tabular-nums">{formatBytes(result.removedBytes)}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {[removedOfLabel(result), ...resultNotes(result)].join(" · ")}
            </span>
          </li>
        ))}
      </ul>

      {report.notRemoved.length > 0 && (
        <div className="grid gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            O que ficou
            {report.notRemoved.length >= NOT_REMOVED_SAMPLE && ` (primeiros ${NOT_REMOVED_SAMPLE})`}
          </p>
          <div className="max-h-48 overflow-y-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <tbody data-selectable>
                {report.notRemoved.map((item) => (
                  <tr key={item.path} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-1.5 font-mono break-all">{item.path}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                      {removalReasonLabels[item.reason]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AlertDialogFooter>
        <Button onClick={onClose}>Fechar e analisar de novo</Button>
      </AlertDialogFooter>
    </>
  );
}
