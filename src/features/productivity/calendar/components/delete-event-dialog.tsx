import { Trash2 } from "lucide-react";
import { useState } from "react";

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
import { type EventOccurrence } from "@/features/productivity/calendar/types";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

export type DeleteScope = "occurrence" | "series";

interface DeleteEventDialogProps {
  /** Ocorrência a excluir; `null` fecha o diálogo. */
  occurrence: EventOccurrence | null;
  onConfirm: (occurrence: EventOccurrence, scope: DeleteScope) => Promise<void>;
  onCancel: () => void;
}

/**
 * Confirmação explícita: nomeia o evento, deixa escolher entre só esta
 * ocorrência e toda a série (se repetir) e avisa que é permanente e auditado.
 */
export function DeleteEventDialog({ occurrence, onConfirm, onCancel }: DeleteEventDialogProps) {
  const [pending, setPending] = useState(false);
  const [scope, setScope] = useState<DeleteScope>("occurrence");

  const recurring = occurrence?.recurring ?? false;
  const effectiveScope: DeleteScope = recurring ? scope : "series";

  return (
    <AlertDialog
      open={occurrence !== null}
      onOpenChange={(open) => {
        if (!open && !pending) {
          setScope("occurrence");
          onCancel();
        }
      }}
    >
      {occurrence && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir evento?</AlertDialogTitle>
            <AlertDialogDescription>
              {effectiveScope === "occurrence" ? (
                <>
                  A ocorrência de{" "}
                  <strong className="text-foreground">{formatDate(occurrence.startDate)}</strong> do
                  evento <strong className="text-foreground">“{occurrence.title}”</strong> será
                  excluída permanentemente. As demais ocorrências continuam.
                </>
              ) : (
                <>
                  O evento <strong className="text-foreground">“{occurrence.title}”</strong>
                  {recurring ? ", com todas as ocorrências," : ""} será excluído permanentemente.
                </>
              )}{" "}
              Esta ação não pode ser desfeita e será registrada no log de auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {recurring && (
            <div role="radiogroup" aria-label="O que excluir" className="grid gap-2">
              {(
                [
                  ["occurrence", "Só esta ocorrência", formatDate(occurrence.startDate)],
                  ["series", "Toda a série", "Todas as ocorrências, passadas e futuras"],
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={scope === value}
                  disabled={pending}
                  onClick={() => {
                    setScope(value);
                  }}
                  className={cn(
                    "grid cursor-pointer gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:shadow-glow-sm focus-visible:outline-none",
                    scope === value
                      ? "border-danger/60 bg-danger/10"
                      : "border-border hover:border-border-strong",
                  )}
                >
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                // Mantém o diálogo aberto até a operação terminar.
                event.preventDefault();
                setPending(true);
                void onConfirm(occurrence, effectiveScope).finally(() => {
                  setPending(false);
                  setScope("occurrence");
                });
              }}
            >
              <Trash2 aria-hidden="true" />
              {pending
                ? "Excluindo…"
                : effectiveScope === "occurrence"
                  ? "Excluir ocorrência"
                  : "Excluir evento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
