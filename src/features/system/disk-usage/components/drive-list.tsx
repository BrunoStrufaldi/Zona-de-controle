import { HardDrive, ScanSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { diskDisplayName, diskKindLabels } from "@/features/system/domain/disks";
import { type DiskUsage } from "@/features/system/types";
import { formatBytes, formatPercent } from "@/lib/format";
import { safeRatio } from "@/lib/math";

interface DriveListProps {
  disks: DiskUsage[];
  /** Unidade da análise mostrada abaixo (o botão vira "Analisar de novo"). */
  analyzedMountPoint: string | null;
  /** Uma análise está rodando: nenhuma outra pode começar. */
  busy: boolean;
  onAnalyze: (mountPoint: string) => void;
}

/** Unidades do computador, cada uma com o botão para analisar o que a ocupa. */
export function DriveList({ disks, analyzedMountPoint, busy, onAnalyze }: DriveListProps) {
  return (
    <ul className="grid gap-3 @2xl:grid-cols-2" aria-label="Unidades">
      {disks.map((disk) => {
        const ratio = safeRatio(disk.usedBytes, disk.totalBytes);
        const analyzed = disk.mountPoint === analyzedMountPoint;
        return (
          <li
            key={disk.mountPoint}
            className="flex items-center gap-4 rounded-lg border border-border bg-card p-4"
          >
            <HardDrive className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="grid min-w-0 flex-1 gap-1.5">
              <span className="flex min-w-0 items-baseline gap-2 text-sm">
                <span className="font-mono font-medium">{disk.mountPoint}</span>
                <span className="truncate text-muted-foreground">
                  {diskDisplayName(disk)} · {diskKindLabels[disk.kind]}
                </span>
              </span>
              <Progress value={ratio * 100} aria-label={`Uso da unidade ${disk.mountPoint}`} />
              <span className="text-xs text-subtle-foreground tabular">
                {formatBytes(disk.usedBytes)} em uso de {formatBytes(disk.totalBytes)} (
                {formatPercent(ratio, 0)})
              </span>
            </div>
            <Button
              size="sm"
              variant={analyzed ? "secondary" : "primary"}
              disabled={busy}
              aria-label={`${analyzed ? "Analisar de novo" : "Analisar"} a unidade ${disk.mountPoint}`}
              onClick={() => {
                onAnalyze(disk.mountPoint);
              }}
            >
              <ScanSearch aria-hidden="true" />
              {analyzed ? "Analisar de novo" : "Analisar"}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
