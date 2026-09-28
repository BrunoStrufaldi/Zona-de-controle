import { MemoryStick } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import { healthBadgeVariant } from "@/features/system/components/health-styles";
import { UsageHistoryChart } from "@/features/system/components/usage-history-chart";
import { healthLabels, usageHealth } from "@/features/system/domain/health";
import { type UsageSample } from "@/features/system/domain/history";
import { type MemoryUsage } from "@/features/system/types";
import { formatBytes, formatPercent } from "@/lib/format";
import { safeRatio } from "@/lib/math";

interface MemoryCardProps {
  memory: MemoryUsage;
  history: readonly UsageSample[];
}

export function MemoryCard({ memory, history }: MemoryCardProps) {
  const health = usageHealth(memory.usedBytes, memory.totalBytes);
  const available = Math.max(0, memory.totalBytes - memory.usedBytes);

  return (
    <WidgetCard
      title="Memória"
      icon={MemoryStick}
      headerExtra={<Badge variant={healthBadgeVariant[health]}>{healthLabels[health]}</Badge>}
      contentClassName="gap-4"
    >
      <p className="grid gap-0.5">
        <span className="text-3xl font-semibold tracking-tight tabular">
          {formatPercent(safeRatio(memory.usedBytes, memory.totalBytes), 0)}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatBytes(memory.usedBytes)} de {formatBytes(memory.totalBytes, 0)} em uso
        </span>
      </p>
      <UsageHistoryChart history={history} series="memory" label="Memória" />
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="grid gap-0.5">
          <dt className="text-xs text-muted-foreground">Disponível</dt>
          <dd className="font-mono tabular">{formatBytes(available)}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-xs text-muted-foreground">Arquivo de paginação</dt>
          <dd className="font-mono tabular">
            {memory.swapTotalBytes > 0
              ? `${formatBytes(memory.swapUsedBytes)} / ${formatBytes(memory.swapTotalBytes, 0)}`
              : "Não configurado"}
          </dd>
        </div>
      </dl>
    </WidgetCard>
  );
}
