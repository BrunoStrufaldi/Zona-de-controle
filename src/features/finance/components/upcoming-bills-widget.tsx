import { ArrowRight, CalendarClock, Plus } from "lucide-react";
import { Link } from "react-router";

import { paths } from "@/app/router/paths";
import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { amountSign, amountToneClass } from "@/features/finance/components/finance-styles";
import {
  occurrenceKey,
  occurrenceStatusLabel,
  UPCOMING_DAYS,
  upcomingBills,
} from "@/features/finance/domain/recurring";
import { type RecurringOverview } from "@/features/finance/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { cn } from "@/lib/cn";
import { formatCents, formatDayMonth } from "@/lib/format";

/** Linhas mostradas no card. */
const LIMIT = 5;

interface UpcomingBillsWidgetProps {
  /** Vencimentos de hoje até `UPCOMING_DAYS` dias à frente (e os atrasados). */
  recurring: AsyncResource<RecurringOverview>;
  className?: string;
}

/** Contas fixas atrasadas e a vencer nos próximos dias, com os dados reais. */
export function UpcomingBillsWidget({ recurring, className }: UpcomingBillsWidgetProps) {
  return (
    <WidgetCard
      title="Próximos vencimentos"
      icon={CalendarClock}
      className={className}
      headerExtra={
        <Button asChild variant="ghost" size="sm" className="h-7 px-2">
          <Link to={paths.finance.recurring}>
            Recorrentes
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <ResourceView resource={recurring} className="py-6">
        {(data) => {
          if (data.series.length === 0) {
            return (
              <EmptyState
                icon={CalendarClock}
                title="Nenhuma recorrente cadastrada"
                className="border-0 py-6"
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link to={paths.finance.recurring}>
                      <Plus aria-hidden="true" />
                      Cadastrar contas fixas
                    </Link>
                  </Button>
                }
              />
            );
          }
          const bills = upcomingBills(data, LIMIT);
          if (bills.length === 0) {
            return (
              <EmptyState
                icon={CalendarClock}
                title={`Nada a pagar nos próximos ${UPCOMING_DAYS} dias`}
                className="border-0 py-6"
              />
            );
          }
          return (
            <div className="grid gap-3">
              {data.summary.overdueCount > 0 && (
                <p className="text-xs text-danger">
                  {data.summary.overdueCount === 1
                    ? "1 vencimento atrasado"
                    : `${data.summary.overdueCount} vencimentos atrasados`}
                  {data.summary.overdueExpenses > 0 &&
                    ` · ${formatCents(data.summary.overdueExpenses)} a pagar`}
                </p>
              )}
              <ul className="grid gap-2" aria-label="Próximos vencimentos">
                {bills.map(({ series, occurrence }) => (
                  <li key={occurrenceKey(occurrence)} className="flex items-center gap-3 text-sm">
                    <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground tabular">
                      {formatDayMonth(occurrence.occurrenceDate)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{series.description}</span>
                    <Badge variant={occurrence.status === "overdue" ? "danger" : "outline"}>
                      {occurrenceStatusLabel(occurrence.status, series.kind)}
                    </Badge>
                    <span
                      className={cn(
                        "w-28 shrink-0 text-right font-mono tabular",
                        amountToneClass[series.kind],
                      )}
                    >
                      {amountSign[series.kind]} {formatCents(occurrence.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }}
      </ResourceView>
    </WidgetCard>
  );
}
