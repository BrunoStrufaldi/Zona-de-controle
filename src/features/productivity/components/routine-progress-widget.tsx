import { Flame, Repeat } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import { Progress } from "@/components/ui/progress";
import { type RoutineProgressSummary } from "@/features/productivity/types";
import { formatPercent } from "@/lib/format";
import { safeRatio } from "@/lib/math";

interface RoutineProgressWidgetProps {
  data: RoutineProgressSummary;
  demo?: boolean;
}

export function RoutineProgressWidget({ data, demo = false }: RoutineProgressWidgetProps) {
  const ratio = safeRatio(data.completedHabits, data.totalHabits);

  return (
    <WidgetCard title="Rotina" icon={Repeat} demo={demo}>
      <p className="text-sm font-medium">{data.name}</p>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="font-mono text-3xl font-semibold tabular">{formatPercent(ratio, 0)}</span>
        <span className="text-sm text-muted-foreground">
          {data.completedHabits} de {data.totalHabits} hábitos
        </span>
      </div>
      <Progress value={ratio * 100} className="mt-3" aria-label="Progresso da rotina" />
      <div className="mt-auto flex items-center gap-2 pt-4 text-sm text-muted-foreground">
        <Flame className="size-4 text-primary" aria-hidden="true" />
        <span>
          <span className="font-medium text-foreground">{data.streakDays} dias</span> seguidos
        </span>
      </div>
    </WidgetCard>
  );
}
