import { History } from "lucide-react";

import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import {
  describeResult,
  outcomeLabels,
  resultIsProblem,
  stepLabels,
} from "@/features/system/windows-repair/domain/repair";
import {
  type RepairHistoryEntry,
  type RepairOutcome,
} from "@/features/system/windows-repair/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { formatDateTime } from "@/lib/format";

const outcomeVariant: Record<RepairOutcome, "success" | "default" | "danger" | "warning"> = {
  success: "success",
  cancelled: "default",
  failure: "danger",
  interrupted: "warning",
};

function EntryRow({ entry }: { entry: RepairHistoryEntry }) {
  // O resumo de cada execução: o último passo ou o problema encontrado.
  const highlight =
    entry.steps.find((record) => resultIsProblem(record.result)) ?? entry.steps.at(-1);
  return (
    <li className="grid gap-1 border-b border-border pb-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{formatDateTime(entry.startedAt)}</span>
        <Badge variant={outcomeVariant[entry.outcome]}>{outcomeLabels[entry.outcome]}</Badge>
        {entry.restartRequired && <Badge variant="warning">Pediu reinício</Badge>}
      </div>
      {entry.error && <span className="text-sm text-muted-foreground">{entry.error}</span>}
      {highlight && (
        <span className="text-sm text-muted-foreground">
          {stepLabels[highlight.step]}: {describeResult(highlight.result)}
        </span>
      )}
      {entry.outcome === "interrupted" && !entry.finishedAt && (
        <span className="text-xs text-subtle-foreground">
          O app foi fechado antes do fim; o resultado não foi registrado.
        </span>
      )}
    </li>
  );
}

/** Reparos anteriores (lidos do log de auditoria). */
export function RepairHistoryCard({ history }: { history: AsyncResource<RepairHistoryEntry[]> }) {
  return (
    <WidgetCard title="Reparos anteriores" icon={History} contentClassName="gap-4">
      <ResourceView resource={history} loadingLabel="Carregando o histórico…">
        {(entries) =>
          entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum reparo feito pelo app ainda.</p>
          ) : (
            <ul className="grid gap-3" aria-label="Reparos anteriores">
              {entries.map((entry) => (
                <EntryRow key={entry.startedAt} entry={entry} />
              ))}
            </ul>
          )
        }
      </ResourceView>
    </WidgetCard>
  );
}
