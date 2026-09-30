import { Cpu, History, Target, Wallet, type LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { activityDescription, activityModule } from "@/features/activity/domain/activity";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { formatDateTime } from "@/lib/format";
import { type ActivityEntry, type ActivityModule } from "@/types/activity";

const moduleIcons: Record<ActivityModule, LucideIcon> = {
  productivity: Target,
  system: Cpu,
  finance: Wallet,
};

interface RecentActivityWidgetProps {
  activity: AsyncResource<ActivityEntry[]>;
}

/** O que aconteceu por último nos módulos (tarefas, hábitos, lançamentos, limpezas, importações). */
export function RecentActivityWidget({ activity }: RecentActivityWidgetProps) {
  return (
    <WidgetCard title="Atividades recentes" icon={History}>
      <ResourceView resource={activity} className="py-6">
        {(entries) =>
          entries.length === 0 ? (
            <EmptyState
              icon={History}
              title="Nenhuma atividade ainda"
              description="Tarefas concluídas, hábitos marcados, lançamentos, limpezas e importações aparecem aqui."
              className="border-0 py-6"
            />
          ) : (
            <ol
              aria-label="Atividades recentes"
              className="relative grid gap-4 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-border"
            >
              {entries.map((entry) => {
                const Icon = moduleIcons[activityModule(entry)];
                return (
                  <li key={entry.id} className="relative flex items-start gap-3">
                    <div className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
                      <Icon className="size-3.5" aria-hidden="true" />
                    </div>
                    <div className="grid min-w-0 gap-0.5 pt-1">
                      <p className="text-sm">{activityDescription(entry)}</p>
                      <time
                        dateTime={entry.occurredAt}
                        className="font-mono text-xs text-subtle-foreground tabular"
                      >
                        {formatDateTime(entry.occurredAt)}
                      </time>
                    </div>
                  </li>
                );
              })}
            </ol>
          )
        }
      </ResourceView>
    </WidgetCard>
  );
}
