import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router";

import { paths } from "@/app/router/paths";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { runOutcomeVariants } from "@/features/system/optimization/components/cleanup-styles";
import {
  historyEntrySummary,
  runOutcomeLabels,
} from "@/features/system/optimization/domain/cleanup";
import { type CleanupHistory } from "@/features/system/optimization/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { formatBytes, formatDateTime, formatNumber } from "@/lib/format";

interface CleanupWidgetProps {
  history: AsyncResource<CleanupHistory>;
}

/**
 * Resumo das limpezas no dashboard: total liberado e a última limpeza. Só lê
 * o histórico; a análise (que percorre as pastas) fica na tela Otimização.
 */
export function CleanupWidget({ history }: CleanupWidgetProps) {
  return (
    <WidgetCard
      title="Limpeza"
      icon={Sparkles}
      headerExtra={
        <Button asChild variant="ghost" size="sm" className="h-7 px-2">
          <Link to={paths.system.optimization}>
            Otimização
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
      contentClassName="gap-3"
    >
      <ResourceView resource={history} className="py-6">
        {(data) => {
          const [last] = data.entries;
          if (data.totalRuns === 0 && !last) {
            return (
              <p className="text-sm text-muted-foreground">
                Nenhuma limpeza feita ainda. Veja quanto espaço dá para liberar na tela Otimização.
              </p>
            );
          }
          return (
            <>
              <div className="grid gap-0.5">
                <span className="text-2xl font-semibold tabular-nums">
                  {formatBytes(data.totalRemovedBytes)}
                </span>
                <span className="text-xs text-muted-foreground">
                  liberados em{" "}
                  {data.totalRuns === 1 ? "1 limpeza" : `${formatNumber(data.totalRuns)} limpezas`}
                </span>
              </div>
              {last && (
                <div
                  role="group"
                  className="grid gap-1 rounded-md border border-border bg-background/40 p-3"
                  aria-label="Última limpeza"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Última: {formatDateTime(last.occurredAt)}
                    </span>
                    <Badge variant={runOutcomeVariants[last.outcome]}>
                      {runOutcomeLabels[last.outcome]}
                    </Badge>
                  </div>
                  <span className="text-sm">{historyEntrySummary(last)}</span>
                </div>
              )}
            </>
          );
        }}
      </ResourceView>
    </WidgetCard>
  );
}
