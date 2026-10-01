import { Download } from "lucide-react";

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
import { type AvailableUpdate } from "@/types/app";

interface InstallUpdateDialogProps {
  /** Versão a instalar; `null` fecha o diálogo. */
  update: AvailableUpdate | null;
  onConfirm: (update: AvailableUpdate) => void;
  onCancel: () => void;
}

/** Confirmação explícita: diz o que acontece antes de instalar (nada é silencioso). */
export function InstallUpdateDialog({ update, onConfirm, onCancel }: InstallUpdateDialogProps) {
  return (
    <AlertDialog
      open={update !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      {update && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Atualizar para a versão {update.version}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="grid gap-3">
                <ol className="grid list-decimal gap-1 pl-5">
                  <li>Um backup do banco é criado na pasta de backups.</li>
                  <li>
                    A versão é baixada do GitHub do projeto e só segue se a assinatura conferir com
                    a do app.
                  </li>
                  <li>O app fecha, instala a versão nova e abre de novo sozinho.</li>
                </ol>
                <p>
                  Salve o que estiver editando antes. Seus dados continuam no mesmo lugar, e tudo
                  fica registrado no log de auditoria.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onConfirm(update);
              }}
            >
              <Download aria-hidden="true" />
              Atualizar e reiniciar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
