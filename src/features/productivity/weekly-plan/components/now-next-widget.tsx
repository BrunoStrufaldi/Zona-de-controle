import { ArrowRight, CalendarRange, Clock } from "lucide-react";
import { Link } from "react-router";

import { weeklyPlanHref } from "@/app/router/paths";
import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Button } from "@/components/ui/button";
import {
  nowAndNext,
  nextStartLabel,
  type TimedBlock,
} from "@/features/productivity/weekly-plan/domain/plan";
import { type PlanBlock } from "@/features/productivity/weekly-plan/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/cn";
import { categoryDotClass } from "@/lib/palette";

interface NowNextWidgetProps {
  plan: AsyncResource<PlanBlock[]>;
  className?: string;
}

/** Dashboard: o bloco do planejamento semanal em andamento e o próximo. */
export function NowNextWidget({ plan, className }: NowNextWidgetProps) {
  const now = useNow();
  return (
    <WidgetCard
      title="Agora e a seguir"
      icon={Clock}
      className={className}
      headerExtra={
        <Button asChild variant="ghost" size="sm" className="h-7 px-2">
          <Link to={weeklyPlanHref}>
            Planejamento
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <ResourceView resource={plan} className="py-6">
        {(blocks) => {
          if (!blocks.some((block) => block.startTime !== null)) {
            return (
              <EmptyState
                icon={CalendarRange}
                title="Nenhum horário planejado"
                description="Monte a sua semana fixa em Rotinas › Planejamento semanal."
                className="border-0 py-6"
              />
            );
          }
          const { current, next } = nowAndNext(blocks, now);
          return (
            <dl className="grid gap-4">
              <div className="grid gap-1">
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Agora
                </dt>
                <dd>
                  {current ? (
                    <BlockLine block={current} detail={`até ${current.endTime}`} />
                  ) : (
                    <span className="text-sm text-muted-foreground">Nada planejado agora.</span>
                  )}
                </dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  A seguir
                </dt>
                <dd>
                  {next ? (
                    <BlockLine
                      block={next.block}
                      detail={nextStartLabel(next.block, next.daysAhead, now)}
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </dd>
              </div>
            </dl>
          );
        }}
      </ResourceView>
    </WidgetCard>
  );
}

function BlockLine({ block, detail }: { block: TimedBlock; detail: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className={cn("size-2.5 shrink-0 rounded-full", categoryDotClass[block.color])}
        aria-hidden="true"
      />
      <span className="truncate text-base font-medium">{block.title}</span>
      <span className="shrink-0 text-sm text-muted-foreground tabular">{detail}</span>
    </span>
  );
}
