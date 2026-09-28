import { Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";

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

interface ConfirmDeleteDialogProps<T> {
  /** Item a excluir; `null` fecha o diálogo. */
  item: T | null;
  title: string;
  /** Deve nomear o item e dizer o que acontece com o que depende dele. */
  describe: (item: T) => ReactNode;
  confirmLabel: string;
  onConfirm: (item: T) => Promise<void>;
  onCancel: () => void;
}

/**
 * Confirmação explícita de uma exclusão definitiva (regra de segurança do
 * projeto): nomeia o item, avisa que é permanente e que fica no log de auditoria.
 */
export function ConfirmDeleteDialog<T>({
  item,
  title,
  describe,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDeleteDialogProps<T>) {
  const [pending, setPending] = useState(false);

  return (
    <AlertDialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      {item !== null && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>
              {describe(item)} Esta ação não pode ser desfeita e será registrada no log de
              auditoria.
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
                void onConfirm(item).finally(() => {
                  setPending(false);
                });
              }}
            >
              <Trash2 aria-hidden="true" />
              {pending ? "Excluindo…" : confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
