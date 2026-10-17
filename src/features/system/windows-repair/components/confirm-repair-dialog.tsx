import { ShieldCheck, TriangleAlert } from "lucide-react";

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
import { REPAIR_CONFIRMATION_NOTES } from "@/features/system/windows-repair/domain/repair";

interface ConfirmRepairDialogProps {
  open: boolean;
  pendingReboot: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmação explícita antes de pedir a elevação. */
export function ConfirmRepairDialog({
  open,
  pendingReboot,
  onConfirm,
  onCancel,
}: ConfirmRepairDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Reparar o Windows?</AlertDialogTitle>
          <AlertDialogDescription>
            O app vai rodar a DISM e o SFC, as ferramentas de reparo do próprio Windows.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {pendingReboot && (
          <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            Há um reinício pendente: o reparo provavelmente vai falhar. O melhor é reiniciar antes.
          </p>
        )}
        <ul className="grid list-disc gap-1.5 pl-5 text-sm text-muted-foreground">
          {REPAIR_CONFIRMATION_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            <ShieldCheck aria-hidden="true" />
            Pedir permissão e reparar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
