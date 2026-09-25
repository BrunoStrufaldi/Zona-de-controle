import { ArrowRight, Flame, Plus, Repeat } from "lucide-react";
import { Link } from "react-router";

import { paths } from "@/app/router/paths";
import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { todayProgress } from "@/features/productivity/routines/domain/routines";
import { type Routine } from "@/features/productivity/routines/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { safeRatio } from "@/lib/math";

interface RoutinesTodayWidgetProps {
  routines: AsyncResource<Routine[]>;
}

/** Rotinas programadas para hoje, com progresso e sequência (dados reais). */
export function RoutinesTodayWidget({ routines }: RoutinesTodayWidgetProps) {
  return (
    <WidgetCard
      title="Rotinas de hoje"
      icon={Repeat}
      headerExtra={
        <Button asChild variant="ghost" size="sm" className="h-7 px-2">
          <Link to={paths.productivity.routines}>
            Ver todas
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <ResourceView resource={routines} className="py-6">
        {(data) => {
          if (data.length === 0) {
            return (
              <EmptyState
                icon={Repeat}
                title="Nenhuma rotina ainda"
                className="border-0 py-6"
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link to={paths.productivity.routines}>
                      <Plus aria-hidden="true" />
                      Criar rotina
                    </Link>
                  </Button>
                }
              />
            );
          }
          const scheduled = data.filter((routine) => todayProgress(routine).scheduled);
          if (scheduled.length === 0) {
            return (
              <p className="text-sm text-muted-foreground">Nenhuma rotina programada para hoje.</p>
            );
          }
          return (
            <ul className="grid gap-4" aria-label="Rotinas de hoje">
              {scheduled.map((routine) => {
                const progress = todayProgress(routine);
                return (
                  <li key={routine.id} className="grid gap-1.5">
                    <div className="flex items-baseline gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{routine.name}</span>
                      <span className="font-mono text-xs text-muted-foreground tabular">
                        {progress.done}/{progress.total}
                      </span>
                      <span
                        className="flex items-center gap-1 text-xs text-muted-foreground"
                        title="Dias seguidos"
                      >
                        <Flame className="size-3.5 text-primary" aria-hidden="true" />
                        <span className="font-medium text-foreground">{routine.currentStreak}</span>
                        <span className="sr-only">dias seguidos</span>
                      </span>
                    </div>
                    <Progress
                      value={safeRatio(progress.done, progress.total) * 100}
                      aria-label={`Progresso de ${routine.name} hoje`}
                    />
                  </li>
                );
              })}
            </ul>
          );
        }}
      </ResourceView>
    </WidgetCard>
  );
}
