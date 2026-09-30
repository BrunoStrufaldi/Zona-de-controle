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
import { blockTimeLabel, weekdaysLabel } from "@/features/productivity/weekly-plan/domain/plan";
import { type PlanBlock } from "@/features/productivity/weekly-plan/types";

interface DeletePlanBlockDialogProps {
  /** Bloco a excluir; `null` fecha o diálogo. */
  block: PlanBlock | null;
  onConfirm: (block: PlanBlock) => Promise<void>;
  onCancel: () => void;
}

/** Confirmação explícita: nomeia o bloco e avisa que é permanente e auditado. */
export function DeletePlanBlockDialog({ block, onConfirm, onCancel }: DeletePlanBlockDialogProps) {
  const [pending, setPending] = useState(false);

  return (
    <AlertDialog
      open={block !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      {block && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir bloco?</AlertDialogTitle>
            <AlertDialogDescription>
              O bloco <strong className="text-foreground">“{block.title}”</strong> (
              {weekdaysLabel(block.weekdays)}, {blockTimeLabel(block).toLowerCase()}) sai do
              planejamento de todos esses dias. Esta ação não pode ser desfeita e será registrada no
              log de auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                // Mantém o diálogo aberto até a operação terminar.
                event.preventDefault();
                setPending(true);
                void onConfirm(block).finally(() => {
                  setPending(false);
                });
              }}
            >
              <Trash2 aria-hidden="true" />
              {pending ? "Excluindo…" : "Excluir bloco"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
