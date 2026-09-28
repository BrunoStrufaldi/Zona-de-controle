import { DatabaseZap, FileClock, List, Trash2, type LucideIcon } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  type CategoryResult,
  categoryCriteria,
  categoryLabels,
  isSelectable,
  itemCountLabel,
  sourceInfo,
  sourceNotes,
} from "@/features/system/optimization/domain/cleanup";
import {
  type CleanupCategoryId,
  type CleanupSource,
  type SourceSummary,
} from "@/features/system/optimization/types";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";

const categoryIcons: Record<CleanupCategoryId, LucideIcon> = {
  tempFiles: FileClock,
  safeCaches: DatabaseZap,
  recycleBin: Trash2,
};

interface SelectionProps {
  /** Origens marcadas para a limpeza. */
  selected: ReadonlySet<CleanupSource>;
  onToggle: (source: CleanupSource, checked: boolean) => void;
  /** Desativa a seleção (ex.: limpeza em andamento). */
  disabled?: boolean;
}

interface CleanupCategoryCardProps extends SelectionProps {
  result: CategoryResult;
  tempMinAgeHours: number;
  onViewItems: (summary: SourceSummary) => void;
  className?: string;
}

/**
 * Uma categoria da análise: cada origem encontrada, com tamanho, observações e
 * a marcação para a limpeza.
 */
export function CleanupCategoryCard({
  result,
  tempMinAgeHours,
  onViewItems,
  className,
  ...selection
}: CleanupCategoryCardProps) {
  const { category, sources, missing, totalBytes } = result;
  const label = categoryLabels[category];

  return (
    <WidgetCard
      title={label}
      icon={categoryIcons[category]}
      headerExtra={
        <Badge variant={totalBytes > 0 ? "primary" : "default"}>{formatBytes(totalBytes)}</Badge>
      }
      className={className}
      contentClassName="gap-4"
    >
      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum local encontrado neste computador.</p>
      ) : (
        <ul className="grid gap-3" aria-label={`Locais de ${label}`}>
          {sources.map((summary) => (
            <SourceRow
              key={summary.source}
              summary={summary}
              tempMinAgeHours={tempMinAgeHours}
              onViewItems={onViewItems}
              {...selection}
            />
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <p className="text-xs text-subtle-foreground">
          Não encontrados neste computador:{" "}
          {missing.map((summary) => sourceInfo[summary.source].name).join(", ")}.
        </p>
      )}
      <p className="mt-auto border-t border-border pt-3 text-xs text-subtle-foreground">
        {categoryCriteria(category, tempMinAgeHours)}
      </p>
    </WidgetCard>
  );
}

interface SourceRowProps extends SelectionProps {
  summary: SourceSummary;
  tempMinAgeHours: number;
  onViewItems: (summary: SourceSummary) => void;
}

function SourceRow({
  summary,
  tempMinAgeHours,
  onViewItems,
  selected,
  onToggle,
  disabled = false,
}: SourceRowProps) {
  const info = sourceInfo[summary.source];
  const empty = summary.itemCount === 0;
  const selectable = isSelectable(summary);
  const checkboxId = `cleanup-${summary.source}`;

  return (
    <li className="grid gap-1.5 rounded-md border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Checkbox
            id={checkboxId}
            aria-label={`Incluir ${info.name} na limpeza`}
            checked={selectable && selected.has(summary.source)}
            disabled={!selectable || disabled}
            onCheckedChange={(checked) => {
              onToggle(summary.source, checked === true);
            }}
          />
          <label htmlFor={checkboxId} className="text-sm font-medium">
            {info.name}
          </label>
          {summary.status === "inUse" && <Badge variant="warning">Em uso</Badge>}
          {empty && <Badge>Vazio</Badge>}
        </div>
        <span className="text-sm font-medium tabular-nums">{formatBytes(summary.totalBytes)}</span>
      </div>
      <p className="text-xs text-muted-foreground">{info.description}</p>
      {sourceNotes(summary, tempMinAgeHours).map((note) => (
        <p
          key={note.text}
          className={cn("text-xs", note.warning ? "text-warning" : "text-subtle-foreground")}
        >
          {note.text}
        </p>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-subtle-foreground">
          {itemCountLabel(summary.source, summary.itemCount)}
        </span>
        {!empty && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Ver itens de ${info.name}`}
            onClick={() => {
              onViewItems(summary);
            }}
          >
            <List aria-hidden="true" />
            Ver itens
          </Button>
        )}
      </div>
    </li>
  );
}
