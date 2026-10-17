import { History, Undo2 } from "lucide-react";
import { useState } from "react";

import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tweakKindLabels, tweakValueLabel } from "@/features/system/system-settings/domain/tweaks";
import { type TweakRecord } from "@/features/system/system-settings/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { formatDateTime } from "@/lib/format";

interface TweakHistoryCardProps {
  history: AsyncResource<TweakRecord[]>;
  onUndo: (record: TweakRecord) => Promise<void>;
  disabled: boolean;
}

function RecordRow({
  record,
  disabled,
  onUndo,
}: {
  record: TweakRecord;
  disabled: boolean;
  onUndo: (record: TweakRecord) => void;
}) {
  return (
    <li className="grid gap-1 border-b border-border pb-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium break-all">{record.label}</span>
        {/* Plano e Modo de Jogo já têm o tipo como nome. */}
        {record.kind === "startupItem" && (
          <Badge variant="outline">{tweakKindLabels[record.kind]}</Badge>
        )}
        {record.undoneAt && <Badge>Desfeito</Badge>}
      </div>
      <span className="text-sm text-muted-foreground">
        {tweakValueLabel(record.previous)} →{" "}
        <span className="text-foreground">{tweakValueLabel(record.applied)}</span>
      </span>
      <span className="text-xs text-subtle-foreground">
        {formatDateTime(record.appliedAt)}
        {record.undoneAt && ` · desfeito em ${formatDateTime(record.undoneAt)}`}
      </span>
      {record.undoable && (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          disabled={disabled}
          aria-label={`Desfazer ${record.label}`}
          onClick={() => {
            onUndo(record);
          }}
        >
          <Undo2 aria-hidden="true" />
          Desfazer
        </Button>
      )}
    </li>
  );
}

/** Ajustes feitos pelo app, com o Desfazer do mais recente de cada item. */
export function TweakHistoryCard({ history, onUndo, disabled }: TweakHistoryCardProps) {
  const [confirming, setConfirming] = useState<TweakRecord | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <WidgetCard title="Ajustes feitos pelo app" icon={History} contentClassName="gap-4">
      <ResourceView resource={history} loadingLabel="Carregando os ajustes…">
        {(records) =>
          records.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum ajuste feito pelo app ainda. Os ajustes aparecem aqui, com o valor anterior,
              para você poder desfazer.
            </p>
          ) : (
            <ul className="grid gap-3" aria-label="Ajustes feitos pelo app">
              {records.map((record) => (
                <RecordRow
                  key={record.id}
                  record={record}
                  disabled={disabled}
                  onUndo={setConfirming}
                />
              ))}
            </ul>
          )
        }
      </ResourceView>
      <p className="text-xs text-subtle-foreground">
        Só o ajuste mais recente de cada item pode ser desfeito, e só se o valor ainda for o que o
        app gravou.
      </p>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirming(null);
        }}
      >
        {confirming && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desfazer “{confirming.label}”?</AlertDialogTitle>
              <AlertDialogDescription>
                Volta de{" "}
                <strong className="text-foreground">{tweakValueLabel(confirming.applied)}</strong>{" "}
                para{" "}
                <strong className="text-foreground">{tweakValueLabel(confirming.previous)}</strong>.
                Fica registrado no log de auditoria.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={(event) => {
                  event.preventDefault();
                  setPending(true);
                  void onUndo(confirming).finally(() => {
                    setPending(false);
                    setConfirming(null);
                  });
                }}
              >
                <Undo2 aria-hidden="true" />
                {pending ? "Desfazendo…" : "Desfazer"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </WidgetCard>
  );
}
