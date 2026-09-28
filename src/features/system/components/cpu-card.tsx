import { Cpu } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import { healthBadgeVariant } from "@/features/system/components/health-styles";
import { UsageHistoryChart } from "@/features/system/components/usage-history-chart";
import { healthLabels, usageHealth } from "@/features/system/domain/health";
import { type UsageSample } from "@/features/system/domain/history";
import { type CpuUsage } from "@/features/system/types";
import { chartColors } from "@/lib/chart-theme";
import { formatPercent } from "@/lib/format";

interface CpuCardProps {
  cpu: CpuUsage;
  history: readonly UsageSample[];
}

export function CpuCard({ cpu, history }: CpuCardProps) {
  const usage = cpu.usagePercent;

  return (
    <WidgetCard
      title="Processador"
      icon={Cpu}
      headerExtra={
        usage !== null && (
          <Badge variant={healthBadgeVariant[usageHealth(usage, 100)]}>
            {healthLabels[usageHealth(usage, 100)]}
          </Badge>
        )
      }
      contentClassName="gap-4"
    >
      <p className="grid gap-0.5">
        <span className="text-3xl font-semibold tracking-tight tabular">
          {usage === null ? "Medindo…" : formatPercent(usage / 100, 0)}
        </span>
        <span className="text-xs text-muted-foreground">uso total da CPU</span>
      </p>
      <UsageHistoryChart history={history} series="cpu" label="CPU" />
      {cpu.coresPercent.length > 0 && <CoreBars cores={cpu.coresPercent} />}
    </WidgetCard>
  );
}

/** Uma barra vertical por núcleo lógico, na mesma cor da série de CPU. */
function CoreBars({ cores }: { cores: readonly number[] }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">Por núcleo lógico ({cores.length})</span>
      <ul className="flex h-10 items-end gap-0.5" aria-label="Uso por núcleo lógico">
        {cores.map((percent, index) => (
          <li
            // Os núcleos são fixos e identificados pela posição.
            key={index}
            className="flex h-full min-w-1 flex-1 items-end rounded-sm bg-raised"
            aria-label={`Núcleo ${index + 1}: ${formatPercent(percent / 100, 0)}`}
            title={`Núcleo ${index + 1}: ${formatPercent(percent / 100, 0)}`}
          >
            <span
              className="w-full rounded-sm transition-[height] duration-500 ease-out-expo"
              style={{
                height: `${Math.max(percent, 2)}%`,
                backgroundColor: chartColors.series1,
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
