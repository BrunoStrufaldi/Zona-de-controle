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
import { type Routine } from "@/features/productivity/routines/types";

interface DeleteRoutineDialogProps {
  /** Rotina a excluir; `null` fecha o diálogo. */
  routine: Routine | null;
  onConfirm: (routine: Routine) => Promise<void>;
  onCancel: () => void;
}

/** Confirmação explícita: nomeia a rotina e avisa que o histórico some e é auditado. */
export function DeleteRoutineDialog({ routine, onConfirm, onCancel }: DeleteRoutineDialogProps) {
  const [pending, setPending] = useState(false);

  return (
    <AlertDialog
      open={routine !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      {routine && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir rotina?</AlertDialogTitle>
            <AlertDialogDescription>
              A rotina <strong className="text-foreground">“{routine.name}”</strong> será excluída
              permanentemente, junto com seus {routine.habits.length}{" "}
              {routine.habits.length === 1 ? "hábito" : "hábitos"} e todo o histórico de marcações e
              sequências. Esta ação não pode ser desfeita e será registrada no log de auditoria.
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
                void onConfirm(routine).finally(() => {
                  setPending(false);
                });
              }}
            >
              <Trash2 aria-hidden="true" />
              {pending ? "Excluindo…" : "Excluir rotina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
