import { Trash2 } from "lucide-react";

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
  confirmationNotes,
  itemCountLabel,
  type SelectionTotals,
  sourceInfo,
} from "@/features/system/optimization/domain/cleanup";
import { formatBytes } from "@/lib/format";

interface ConfirmCleanupDialogProps {
  /** Seleção a confirmar; `null` fecha o diálogo. */
  selection: SelectionTotals | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmação explícita da limpeza (regra de segurança do projeto): mostra
 * cada local, quantos itens e quanto espaço, e avisa que é permanente e
 * auditada. A lista completa de cada local está em "Ver itens".
 */
export function ConfirmCleanupDialog({
  selection,
  onConfirm,
  onCancel,
}: ConfirmCleanupDialogProps) {
  return (
    <AlertDialog
      open={selection !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      {selection && (
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {formatBytes(selection.totalBytes)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Estes itens encontrados na análise serão removidos permanentemente:
            </AlertDialogDescription>
          </AlertDialogHeader>

          <ul
            className="grid gap-1.5 rounded-md border border-border bg-background/40 p-3 text-sm"
            aria-label="O que será removido"
          >
            {selection.sources.map((summary) => (
              <li key={summary.source} className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{sourceInfo[summary.source].name}</span>
                <span className="text-right text-muted-foreground tabular-nums">
                  {itemCountLabel(summary.source, summary.itemCount)} ·{" "}
                  {formatBytes(summary.totalBytes)}
                </span>
              </li>
            ))}
          </ul>

          <ul className="grid list-disc gap-1 pl-5 text-xs text-muted-foreground">
            {confirmationNotes(selection.sources).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>
              <Trash2 aria-hidden="true" />
              Remover {formatBytes(selection.totalBytes)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
