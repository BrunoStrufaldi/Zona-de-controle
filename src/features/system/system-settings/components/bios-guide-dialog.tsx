import { TriangleAlert } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { biosGuide } from "@/features/system/system-settings/domain/hardware";
import { type GuideTopic } from "@/features/system/system-settings/domain/settings";
import { type HardwareReport } from "@/features/system/system-settings/types";

interface BiosGuideDialogProps {
  /** Tópico aberto; `null` fecha o diálogo. */
  topic: GuideTopic | null;
  report: HardwareReport;
  onClose: () => void;
}

/** Passo a passo na BIOS. O app só explica: nunca altera a BIOS. */
export function BiosGuideDialog({ topic, report, onClose }: BiosGuideDialogProps) {
  const guide = topic && biosGuide(topic, report.board, report.bios?.version ?? null);
  return (
    <Dialog
      open={topic !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        {guide && (
          <>
            <DialogHeader>
              <DialogTitle>{guide.title}</DialogTitle>
              <DialogDescription>
                Feito por você, na BIOS. O Zona de Controle nunca altera a BIOS.
              </DialogDescription>
            </DialogHeader>
            <ol className="grid gap-2.5" aria-label="Passos">
              {guide.steps.map((step, index) => (
                <li key={step} className="flex items-start gap-3 text-sm">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-mono text-[10px] text-primary">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <ul
              className="grid gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3"
              aria-label="Cuidados"
            >
              {guide.warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-2 text-sm">
                  <TriangleAlert
                    className="mt-0.5 size-4 shrink-0 text-warning"
                    aria-hidden="true"
                  />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
