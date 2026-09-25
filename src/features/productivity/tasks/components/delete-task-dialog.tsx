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
import { type Task } from "@/features/productivity/tasks/types";

interface DeleteTaskDialogProps {
  /** Tarefa a excluir; `null` fecha o diálogo. */
  task: Task | null;
  onConfirm: (task: Task) => Promise<void>;
  onCancel: () => void;
}

/**
 * Confirmação explícita da exclusão definitiva (regra de segurança do projeto):
 * informa exatamente o que será removido e que a ação fica registrada.
 */
export function DeleteTaskDialog({ task, onConfirm, onCancel }: DeleteTaskDialogProps) {
  const [pending, setPending] = useState(false);

  return (
    <AlertDialog
      open={task !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      {task && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              A tarefa <strong className="text-foreground">“{task.title}”</strong> será excluída
              permanentemente, junto com suas tags. Esta ação não pode ser desfeita e será
              registrada no log de auditoria.
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
                void onConfirm(task).finally(() => {
                  setPending(false);
                });
              }}
            >
              <Trash2 aria-hidden="true" />
              {pending ? "Excluindo…" : "Excluir tarefa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
