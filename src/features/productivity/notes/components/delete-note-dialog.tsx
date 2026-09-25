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
import { noteDisplayTitle } from "@/features/productivity/notes/domain/notes";
import { type Note } from "@/features/productivity/notes/types";

interface DeleteNoteDialogProps {
  /** Nota a excluir; `null` fecha o diálogo. */
  note: Note | null;
  onConfirm: (note: Note) => Promise<void>;
  onCancel: () => void;
}

/** Confirmação explícita da exclusão definitiva de uma nota (e do seu histórico). */
export function DeleteNoteDialog({ note, onConfirm, onCancel }: DeleteNoteDialogProps) {
  const [pending, setPending] = useState(false);

  return (
    <AlertDialog
      open={note !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      {note && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir nota?</AlertDialogTitle>
            <AlertDialogDescription>
              A nota <strong className="text-foreground">“{noteDisplayTitle(note)}”</strong> será
              excluída permanentemente, junto com suas tags e todo o histórico de versões. Esta ação
              não pode ser desfeita e será registrada no log de auditoria.
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
                void onConfirm(note).finally(() => {
                  setPending(false);
                });
              }}
            >
              <Trash2 aria-hidden="true" />
              {pending ? "Excluindo…" : "Excluir nota"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
