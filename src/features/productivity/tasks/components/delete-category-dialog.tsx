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
import { type TaskCategory } from "@/features/productivity/tasks/types";

interface DeleteCategoryDialogProps {
  /** Categoria a excluir; `null` fecha o diálogo. */
  category: TaskCategory | null;
  onConfirm: (category: TaskCategory) => Promise<void>;
  onCancel: () => void;
}

/**
 * Confirmação explícita da exclusão de uma categoria: nomeia a categoria, diz
 * quantas tarefas ficarão sem categoria e avisa que é permanente e auditada.
 */
export function DeleteCategoryDialog({ category, onConfirm, onCancel }: DeleteCategoryDialogProps) {
  const [pending, setPending] = useState(false);

  return (
    <AlertDialog
      open={category !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      {category && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              A categoria <strong className="text-foreground">“{category.name}”</strong> será
              excluída permanentemente.{" "}
              {category.taskCount === 0
                ? "Nenhuma tarefa usa esta categoria."
                : `${category.taskCount} ${category.taskCount === 1 ? "tarefa ficará" : "tarefas ficarão"} sem categoria (as tarefas não são excluídas).`}{" "}
              Esta ação não pode ser desfeita e será registrada no log de auditoria.
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
                void onConfirm(category).finally(() => {
                  setPending(false);
                });
              }}
            >
              <Trash2 aria-hidden="true" />
              {pending ? "Excluindo…" : "Excluir categoria"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
