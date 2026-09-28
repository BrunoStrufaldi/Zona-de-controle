import { History } from "lucide-react";

import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import {
  historyEntrySummary,
  historyTotalLabel,
  runOutcomeLabels,
  sourceNamesLabel,
} from "@/features/system/optimization/domain/cleanup";
import { runOutcomeVariants } from "@/features/system/optimization/components/cleanup-styles";
import { type CleanupHistory } from "@/features/system/optimization/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

interface CleanupHistoryCardProps {
  history: AsyncResource<CleanupHistory>;
  className?: string;
}

/** Limpezas feitas (e recusadas), lidas do log de auditoria. */
export function CleanupHistoryCard({ history, className }: CleanupHistoryCardProps) {
  return (
    <WidgetCard
      title="Histórico de limpezas"
      icon={History}
      className={className}
      contentClassName="gap-4"
    >
      <ResourceView resource={history} className="py-6">
        {(data) => (
          <>
            <p className="text-sm text-muted-foreground" role="status">
              {historyTotalLabel(data) ?? "Nenhuma limpeza feita ainda."}
            </p>
            {data.entries.length > 0 && (
              <ul className="grid gap-2" aria-label="Limpezas recentes">
                {data.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="grid gap-0.5 rounded-md border border-border bg-background/40 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium tabular-nums">
                        {formatDateTime(entry.occurredAt)}
                      </span>
                      <Badge variant={runOutcomeVariants[entry.outcome]}>
                        {runOutcomeLabels[entry.outcome]}
                      </Badge>
                    </div>
                    {entry.sources.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {sourceNamesLabel(entry.sources)}
                      </span>
                    )}
                    <span
                      className={cn(
                        "text-xs",
                        entry.outcome === "failed" ? "text-danger" : "text-subtle-foreground",
                      )}
                    >
                      {historyEntrySummary(entry)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </ResourceView>
      <p className="mt-auto border-t border-border pt-3 text-xs text-subtle-foreground">
        Lido do log de auditoria (Configurações › Auditoria), que não pode ser apagado.
      </p>
    </WidgetCard>
  );
}
