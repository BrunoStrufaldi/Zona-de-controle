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
        note={fixedNote(summary.monthlyCardExpenses, summary.monthlyIncome)}
        icon={Repeat}
        tone="primary"
      />
      <Metric
        label="Realizado no mês"
        value={formatCents(totals.expensesRealized)}
        note={`de ${formatCents(totals.expenses)} previstos (pago ou na fatura)`}
        icon={CircleCheck}
        tone="success"
      />
      <Metric
        label="Falta no mês"
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

/** "R$ 180,00 no cartão · R$ 8.000,00 de receitas fixas". */
function fixedNote(card: number, income: number): string | undefined {
  const parts = [
    card > 0 ? `${formatCents(card)} no cartão` : null,
    income > 0 ? `${formatCents(income)} de receitas fixas` : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
