import { Check } from "lucide-react";
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
import {
  type PendingChange,
  TWEAK_CONFIRMATION_NOTES,
} from "@/features/system/system-settings/domain/tweaks";

interface ConfirmTweaksDialogProps {
  /** Mudanças a confirmar; `null` fecha o diálogo. */
  changes: PendingChange[] | null;
  onConfirm: (changes: PendingChange[]) => Promise<void>;
  onCancel: () => void;
}

/**
 * Confirmação explícita dos ajustes: cada um com o valor atual e o novo, e o
 * aviso de que dá para desfazer e de que tudo é auditado.
 */
export function ConfirmTweaksDialog({ changes, onConfirm, onCancel }: ConfirmTweaksDialogProps) {
  const [pending, setPending] = useState(false);
  const count = changes?.length ?? 0;

  return (
    <AlertDialog
      open={changes !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      {changes && (
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {count === 1 ? "Aplicar 1 ajuste?" : `Aplicar ${count} ajustes?`}
            </AlertDialogTitle>
            <AlertDialogDescription>O que vai mudar no Windows:</AlertDialogDescription>
          </AlertDialogHeader>

          <ul
            className="grid gap-2 rounded-md border border-border bg-background/40 p-3 text-sm"
            aria-label="O que vai mudar"
          >
            {changes.map((change) => (
              <li key={change.key} className="grid gap-0.5">
                <span className="font-medium break-all">{change.label}</span>
                <span className="text-muted-foreground">
                  {change.from} → <span className="text-foreground">{change.to}</span>
                </span>
              </li>
            ))}
          </ul>

          <ul className="grid list-disc gap-1 pl-5 text-xs text-muted-foreground">
            {TWEAK_CONFIRMATION_NOTES.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                // Mantém o diálogo aberto até terminar.
                event.preventDefault();
                setPending(true);
                void onConfirm(changes).finally(() => {
                  setPending(false);
                });
              }}
            >
              <Check aria-hidden="true" />
              {pending ? "Aplicando…" : "Aplicar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
