import { Cpu, History, Target, Wallet, type LucideIcon } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import { formatDateTime } from "@/lib/format";
import { type ActivityEntry, type ActivityModule } from "@/types/activity";

const moduleIcons: Record<ActivityModule, LucideIcon> = {
  productivity: Target,
  system: Cpu,
  finance: Wallet,
};

interface RecentActivityWidgetProps {
  entries: readonly ActivityEntry[];
  demo?: boolean;
}

export function RecentActivityWidget({ entries, demo = false }: RecentActivityWidgetProps) {
  return (
    <WidgetCard title="Atividades recentes" icon={History} demo={demo}>
      <ol className="relative grid gap-4 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-border">
        {entries.map((entry) => {
          const Icon = moduleIcons[entry.module];
          return (
            <li key={entry.id} className="relative flex items-start gap-3">
              <div className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
                <Icon className="size-3.5" aria-hidden="true" />
              </div>
              <div className="grid min-w-0 gap-0.5 pt-1">
                <p className="text-sm">{entry.description}</p>
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
    </WidgetCard>
  );
}
