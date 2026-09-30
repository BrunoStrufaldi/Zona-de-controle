import { AlertTriangle, CircleCheck, Hourglass, Repeat } from "lucide-react";

import { Metric } from "@/features/finance/components/finance-metrics";
import { plannedRemaining } from "@/features/finance/domain/recurring";
import { type RecurringOverview } from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";

interface RecurringMetricsProps {
  recurring: RecurringOverview;
  className?: string;
}

/** Compromisso mensal, andamento do período e atrasos das recorrentes. */
export function RecurringMetrics({ recurring, className }: RecurringMetricsProps) {
  const { summary, totals } = recurring;
  const remaining = plannedRemaining(totals);

  return (
    <dl className={cn("grid grid-cols-2 gap-3 @3xl:grid-cols-4", className)}>
      <Metric
        label="Contas fixas por mês"
        value={formatCents(summary.monthlyExpenses)}
        note={
          summary.monthlyIncome > 0
            ? `${formatCents(summary.monthlyIncome)} de receitas fixas`
            : undefined
        }
        icon={Repeat}
        tone="primary"
      />
      <Metric
        label="Pago no mês"
        value={formatCents(totals.expensesPaid)}
        note={`de ${formatCents(totals.expenses)} previstos`}
        icon={CircleCheck}
        tone="success"
      />
      <Metric
        label="Falta pagar no mês"
        value={formatCents(remaining.expenses)}
        note={remaining.income > 0 ? `${formatCents(remaining.income)} a receber` : undefined}
        icon={Hourglass}
        tone="primary"
      />
      <Metric
        label="Atrasadas"
        value={String(summary.overdueCount)}
        note={
          summary.overdueExpenses > 0
            ? `${formatCents(summary.overdueExpenses)} a pagar`
            : summary.overdueCount === 0
              ? "tudo em dia"
              : undefined
        }
        icon={AlertTriangle}
        tone={summary.overdueCount > 0 ? "danger" : "success"}
      />
    </dl>
  );
}
