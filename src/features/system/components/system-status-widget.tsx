import { Activity, ArrowRight, Clock } from "lucide-react";
import { Link } from "react-router";

import { paths } from "@/app/router/paths";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { healthBadgeVariant, healthProgressTone } from "@/features/system/components/health-styles";
import { healthLabels, systemHealth, usageHealth } from "@/features/system/domain/health";
import { type HealthStatus, type SystemSnapshot } from "@/features/system/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { formatBytes, formatDuration, formatPercent } from "@/lib/format";
import { safeRatio } from "@/lib/math";

interface SystemStatusWidgetProps {
  snapshot: AsyncResource<SystemSnapshot>;
}

/** CPU, memória e tempo ligado, com leitura real do sistema. */
export function SystemStatusWidget({ snapshot }: SystemStatusWidgetProps) {
  return (
    <WidgetCard
      title="Status do sistema"
      icon={Activity}
      headerExtra={
        <>
          {snapshot.status === "success" && (
            <Badge variant={healthBadgeVariant[systemHealth(snapshot.data)]}>
              {healthLabels[systemHealth(snapshot.data)]}
            </Badge>
          )}
          <Button asChild variant="ghost" size="sm" className="h-7 px-2">
            <Link to={paths.system.monitor}>
              Monitor
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </>
      }
    >
      <ResourceView resource={snapshot} className="py-6">
        {(data) => <StatusContent data={data} />}
      </ResourceView>
    </WidgetCard>
  );
}

function StatusContent({ data }: { data: SystemSnapshot }) {
  const { cpu, memory } = data;

  return (
    <>
      <div className="grid gap-4">
        {cpu.usagePercent === null ? (
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">CPU</span>
              <span className="text-xs text-subtle-foreground">Medindo…</span>
            </div>
            <Progress value={0} aria-label="Uso de CPU (medindo)" />
          </div>
        ) : (
          <UsageRow
            label="CPU"
            value={formatPercent(cpu.usagePercent / 100, 0)}
            percent={cpu.usagePercent}
            health={usageHealth(cpu.usagePercent, 100)}
          />
        )}
        <UsageRow
          label="Memória"
          value={`${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes, 0)}`}
          percent={safeRatio(memory.usedBytes, memory.totalBytes) * 100}
          health={usageHealth(memory.usedBytes, memory.totalBytes)}
        />
      </div>
      <div className="mt-auto flex items-center gap-2 pt-4 text-sm text-muted-foreground">
        <Clock className="size-4" aria-hidden="true" />
        Ligado há <span className="text-foreground">{formatDuration(data.uptimeSeconds)}</span>
      </div>
    </>
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
