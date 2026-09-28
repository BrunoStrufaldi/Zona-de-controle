import { ChartPie } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { WidgetCard } from "@/components/shared/widget-card";
import { categoryDotClass } from "@/features/finance/components/finance-styles";
import { type CategoryShare } from "@/features/finance/domain/categories";
import { cn } from "@/lib/cn";
import { formatCents, formatPercent } from "@/lib/format";

interface CategoryBreakdownCardProps {
  shares: readonly CategoryShare[];
}

/** Para onde foram as despesas do mês, da maior para a menor categoria. */
export function CategoryBreakdownCard({ shares }: CategoryBreakdownCardProps) {
  return (
    <WidgetCard title="Despesas por categoria" icon={ChartPie}>
      {shares.length === 0 ? (
        <EmptyState icon={ChartPie} title="Nenhuma despesa neste mês" className="border-0 py-6" />
      ) : (
        <ul className="grid gap-3" aria-label="Despesas por categoria">
          {shares.map((share) => (
            <li key={share.id ?? "none"} className="grid gap-1.5">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    share.color ? categoryDotClass[share.color] : "bg-subtle-foreground",
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{share.name}</span>
                <span className="font-mono text-xs text-muted-foreground tabular">
                  {formatPercent(share.share)}
                </span>
                <span className="w-28 text-right font-mono tabular">
                  {formatCents(share.total)}
                </span>
              </div>
              <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-raised">
                <div
                  className={cn(
                    "h-full rounded-full",
                    share.color ? categoryDotClass[share.color] : "bg-subtle-foreground",
                  )}
                  style={{ width: `${Math.max(share.share * 100, 1)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
