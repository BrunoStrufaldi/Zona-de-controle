import { HardDrive } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Progress } from "@/components/ui/progress";
import { healthProgressTone } from "@/features/system/components/health-styles";
import { diskDisplayName, diskKindLabels } from "@/features/system/domain/disks";
import { usageHealth } from "@/features/system/domain/health";
import { type DiskUsage, type SystemSnapshot } from "@/features/system/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { formatBytes, formatPercent } from "@/lib/format";
import { safeRatio } from "@/lib/math";

interface StorageWidgetProps {
  snapshot: AsyncResource<SystemSnapshot>;
  className?: string;
}

/** Espaço usado em cada unidade (dashboard e Monitor), com leitura real do sistema. */
export function StorageWidget({ snapshot, className }: StorageWidgetProps) {
  return (
    <WidgetCard title="Armazenamento" icon={HardDrive} className={className}>
      <ResourceView resource={snapshot} className="py-6">
        {(data) =>
          data.disks.length === 0 ? (
            <EmptyState
              icon={HardDrive}
              title="Nenhuma unidade encontrada"
              className="border-0 py-6"
            />
          ) : (
            <ul className="grid gap-4" aria-label="Unidades de armazenamento">
              {data.disks.map((disk) => (
                <DiskRow key={disk.mountPoint} disk={disk} />
              ))}
            </ul>
          )
        }
      </ResourceView>
    </WidgetCard>
  );
}

function DiskRow({ disk }: { disk: DiskUsage }) {
  const ratio = safeRatio(disk.usedBytes, disk.totalBytes);
  const health = usageHealth(disk.usedBytes, disk.totalBytes);
  const details = [diskKindLabels[disk.kind], disk.fileSystem].filter((part) => part !== "");

  return (
    <li className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate">
          <span className="font-mono font-medium">{disk.mountPoint}</span>{" "}
          <span className="text-muted-foreground">{diskDisplayName(disk)}</span>
        </span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular">
          {formatBytes(disk.usedBytes, 0)} / {formatBytes(disk.totalBytes, 0)}
        </span>
      </div>
      <Progress
        value={ratio * 100}
        tone={healthProgressTone[health]}
        aria-label={`Uso da unidade ${disk.mountPoint}`}
      />
      <span className="flex flex-wrap justify-between gap-x-3 text-xs text-subtle-foreground">
        <span>
          {formatPercent(ratio, 0)} em uso · {formatBytes(disk.totalBytes - disk.usedBytes, 0)}{" "}
          livres
        </span>
        <span>{details.join(" · ")}</span>
      </span>
    </li>
  );
}
