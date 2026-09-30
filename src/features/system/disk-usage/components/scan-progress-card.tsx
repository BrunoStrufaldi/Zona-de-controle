import { LoaderCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { filesLabel, progressShare } from "@/features/system/disk-usage/domain/disk-usage";
import { type DiskUsageProgress } from "@/features/system/disk-usage/types";
import { formatBytes } from "@/lib/format";

interface ScanProgressCardProps {
  mountPoint: string;
  progress: DiskUsageProgress | null;
  /** Espaço em uso na unidade (base da barra); `null` se desconhecido. */
  volumeUsedBytes: number | null;
  cancelRequested: boolean;
  onCancel: () => void;
}

/** Andamento da análise: o que já foi lido e a pasta atual, com cancelamento. */
export function ScanProgressCard({
  mountPoint,
  progress,
  volumeUsedBytes,
  cancelRequested,
  onCancel,
}: ScanProgressCardProps) {
  const share = progress && volumeUsedBytes ? progressShare(progress, volumeUsedBytes) : 0;
  return (
    <Card className="animate-fade-in">
      <CardContent className="grid gap-3 pt-6" role="status" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />
            {cancelRequested ? "Cancelando…" : `Analisando ${mountPoint}…`}
          </span>
          <Button variant="secondary" size="sm" disabled={cancelRequested} onClick={onCancel}>
            <X aria-hidden="true" />
            Cancelar análise
          </Button>
        </div>
        <Progress value={share * 100} aria-label="Andamento da análise" />
        <p className="text-sm text-muted-foreground tabular">
          {progress
            ? `${filesLabel(progress.files)} · ${formatBytes(progress.allocatedBytes)}${volumeUsedBytes ? ` de ${formatBytes(volumeUsedBytes)} em uso` : ""}`
            : "Começando…"}
        </p>
        {progress?.currentFolder && (
          <p
            className="truncate font-mono text-xs text-subtle-foreground"
            title={progress.currentFolder}
          >
            {progress.currentFolder}
          </p>
        )}
        <p className="text-xs text-subtle-foreground">
          Só leitura: nomes, tamanhos e datas. A primeira análise pode levar alguns minutos; as
          seguintes costumam ser bem mais rápidas.
        </p>
      </CardContent>
    </Card>
  );
}
