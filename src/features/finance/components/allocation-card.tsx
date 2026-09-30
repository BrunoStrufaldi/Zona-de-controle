import { ChartPie } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { WidgetCard } from "@/components/shared/widget-card";
import { categoryDotClass } from "@/features/finance/components/finance-styles";
import { assetClassColors, assetClassLabels } from "@/features/finance/domain/investments";
import { type ClassShare } from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { formatCents, formatPercent } from "@/lib/format";

interface AllocationCardProps {
  shares: readonly ClassShare[];
  className?: string;
}

/** Quanto da carteira está em cada classe (renda fixa, ações…), da maior para a menor. */
export function AllocationCard({ shares, className }: AllocationCardProps) {
  return (
    <WidgetCard title="Distribuição por classe" icon={ChartPie} className={className}>
      {shares.length === 0 ? (
        <EmptyState icon={ChartPie} title="Nada investido ainda" className="border-0 py-6" />
      ) : (
        <ul className="grid gap-3" aria-label="Distribuição por classe">
          {shares.map((share) => {
            const color = categoryDotClass[assetClassColors[share.class]];
            return (
              <li key={share.class} className="grid gap-1.5">
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className={cn("size-2.5 shrink-0 rounded-full", color)}
                  />
                  <span className="min-w-0 flex-1 truncate">{assetClassLabels[share.class]}</span>
                  <span className="font-mono text-xs text-muted-foreground tabular">
                    {formatPercent(share.share)}
                  </span>
                  <span className="w-28 text-right font-mono tabular">
                    {formatCents(share.value)}
                  </span>
                </div>
                <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-raised">
                  <div
                    className={cn("h-full rounded-full", color)}
                    style={{ width: `${Math.max(share.share * 100, 1)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
