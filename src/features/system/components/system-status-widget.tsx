import { Activity, Clock } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { healthBadgeVariant, healthProgressTone } from "@/features/system/components/health-styles";
import { healthLabels, usageHealth } from "@/features/system/domain/health";
import { type HealthStatus, type SystemOverview } from "@/features/system/types";
import { formatBytes, formatDuration, formatPercent } from "@/lib/format";
import { safeRatio } from "@/lib/math";

interface SystemStatusWidgetProps {
  data: SystemOverview;
  demo?: boolean;
}

export function SystemStatusWidget({ data, demo = false }: SystemStatusWidgetProps) {
  const { usage } = data;
  const memoryRatio = safeRatio(usage.memoryUsedBytes, usage.memoryTotalBytes);

  return (
    <WidgetCard
      title="Status do sistema"
      icon={Activity}
      demo={demo}
      headerExtra={
        <Badge variant={healthBadgeVariant[data.status]}>{healthLabels[data.status]}</Badge>
      }
    >
      <div className="grid gap-4">
        <UsageRow
          label="CPU"
          value={formatPercent(usage.cpuPercent / 100, 0)}
          percent={usage.cpuPercent}
          health={usageHealth(usage.cpuPercent, 100)}
        />
        <UsageRow
          label="Memória"
          value={`${formatBytes(usage.memoryUsedBytes)} / ${formatBytes(usage.memoryTotalBytes, 0)}`}
          percent={memoryRatio * 100}
          health={usageHealth(usage.memoryUsedBytes, usage.memoryTotalBytes)}
        />
      </div>
      <div className="mt-auto flex items-center gap-2 pt-4 text-sm text-muted-foreground">
        <Clock className="size-4" aria-hidden="true" />
        Ligado há <span className="text-foreground">{formatDuration(data.uptimeSeconds)}</span>
      </div>
    </WidgetCard>
  );
}

interface UsageRowProps {
  label: string;
  value: string;
  percent: number;
  health: HealthStatus;
}

function UsageRow({ label, value, percent, health }: UsageRowProps) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-xs tabular">{value}</span>
      </div>
      <Progress value={percent} tone={healthProgressTone[health]} aria-label={`Uso de ${label}`} />
    </div>
  );
}
