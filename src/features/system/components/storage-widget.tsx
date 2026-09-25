import { HardDrive } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import { Progress } from "@/components/ui/progress";
import { healthProgressTone } from "@/features/system/components/health-styles";
import { usageHealth } from "@/features/system/domain/health";
import { type StorageVolume } from "@/features/system/types";
import { formatBytes, formatPercent } from "@/lib/format";
import { safeRatio } from "@/lib/math";

interface StorageWidgetProps {
  volumes: readonly StorageVolume[];
  demo?: boolean;
}

export function StorageWidget({ volumes, demo = false }: StorageWidgetProps) {
  return (
    <WidgetCard title="Armazenamento" icon={HardDrive} demo={demo}>
      <ul className="grid gap-4">
        {volumes.map((volume) => {
          const ratio = safeRatio(volume.usedBytes, volume.totalBytes);
          const health = usageHealth(volume.usedBytes, volume.totalBytes);
          return (
            <li key={volume.mountPoint} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-mono font-medium">{volume.mountPoint}</span>{" "}
                  <span className="text-muted-foreground">{volume.label}</span>
                </span>
                <span className="font-mono text-xs text-muted-foreground tabular">
                  {formatBytes(volume.usedBytes, 0)} / {formatBytes(volume.totalBytes, 0)}
                </span>
              </div>
              <Progress
                value={ratio * 100}
                tone={healthProgressTone[health]}
                aria-label={`Uso da unidade ${volume.mountPoint}`}
              />
              <span className="text-xs text-subtle-foreground">
                {formatPercent(ratio, 0)} em uso ·{" "}
                {formatBytes(volume.totalBytes - volume.usedBytes, 0)} livres
              </span>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}
