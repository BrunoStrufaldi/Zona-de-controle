import { CircleCheck, Download, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { InstallUpdateDialog } from "@/features/app-update/components/install-update-dialog";
import {
  downloadedText,
  updateFraction,
  updateStageLabels,
} from "@/features/app-update/domain/update";
import { type AppUpdateState, useAppUpdate } from "@/features/app-update/hooks/use-app-update";
import { type AvailableUpdate } from "@/types/app";

/**
 * Atualização do app, só pelo botão: procura no GitHub do projeto, mostra as
 * novidades e instala depois da confirmação (backup e assinatura no Rust).
 */
export function AppUpdateCard() {
  const { state, check, install } = useAppUpdate();
  const [confirming, setConfirming] = useState<AvailableUpdate | null>(null);
  const busy = state.phase === "checking" || state.phase === "installing";

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Atualizações</CardTitle>
          <CardDescription>
            O app só procura quando você clica. A versão nova vem do GitHub do projeto e só é
            instalada se a assinatura conferir.
          </CardDescription>
        </div>
        <Button variant="outline" onClick={check} disabled={busy}>
          <RefreshCw
            aria-hidden="true"
            className={state.phase === "checking" ? "animate-spin" : ""}
          />
          {state.phase === "checking" ? "Procurando…" : "Procurar atualizações"}
        </Button>
      </CardHeader>
      {state.phase !== "idle" && state.phase !== "checking" && (
        <CardContent>
          <UpdateStatus state={state} onInstall={setConfirming} />
        </CardContent>
      )}
      <InstallUpdateDialog
        update={confirming}
        onCancel={() => {
          setConfirming(null);
        }}
        onConfirm={(update) => {
          setConfirming(null);
          install(update);
        }}
      />
    </Card>
  );
}

interface UpdateStatusProps {
  state: AppUpdateState;
  onInstall: (update: AvailableUpdate) => void;
}

function UpdateStatus({ state, onInstall }: UpdateStatusProps) {
  switch (state.phase) {
    case "up-to-date":
      return (
        <p role="status" className="flex items-center gap-2 text-sm">
          <CircleCheck className="size-4 text-success" aria-hidden="true" />
          Você já está na versão mais recente.
        </p>
      );
    case "available":
      return <AvailableUpdateDetails update={state.update} onInstall={onInstall} />;
    case "installing": {
      const fraction = updateFraction(state.progress);
      const downloaded = downloadedText(state.progress);
      return (
        <div role="status" className="grid gap-2">
          <p className="text-sm">
            {state.progress ? updateStageLabels[state.progress.stage] : "Preparando…"}
          </p>
          <Progress
            value={fraction === null ? 0 : fraction * 100}
            aria-label="Andamento da atualização"
            className={fraction === null ? "animate-pulse" : undefined}
          />
          {downloaded && <p className="text-xs text-muted-foreground tabular">{downloaded}</p>}
        </div>
      );
    }
    case "error":
      return (
        <div className="grid gap-3">
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {state.error.message}
          </p>
          {state.update && (
            <AvailableUpdateDetails update={state.update} onInstall={onInstall} retry />
          )}
        </div>
      );
    default:
      return null;
  }
}

interface AvailableUpdateDetailsProps {
  update: AvailableUpdate;
  onInstall: (update: AvailableUpdate) => void;
  retry?: boolean;
}

function AvailableUpdateDetails({ update, onInstall, retry = false }: AvailableUpdateDetailsProps) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <p className="text-sm font-medium">Versão {update.version} disponível</p>
        <p className="text-xs text-muted-foreground">
          Você está na versão {update.currentVersion}.
        </p>
      </div>
      {update.notes && (
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Novidades</span>
          <p
            className="max-h-48 overflow-y-auto rounded-md border border-border bg-background/40 p-3 text-sm whitespace-pre-line"
            data-selectable
          >
            {update.notes}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => {
            onInstall(update);
          }}
        >
          <Download aria-hidden="true" />
          {retry ? "Tentar de novo" : "Atualizar e reiniciar"}
        </Button>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Backup automático antes de instalar
        </span>
      </div>
    </div>
  );
}
