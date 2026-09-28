import { ArrowDownRight, ArrowUpRight, type LucideIcon, PiggyBank, Scale } from "lucide-react";

import { summarizeCashflow } from "@/features/finance/domain/cashflow";
import { type PeriodTotals } from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { formatCents, formatPercent } from "@/lib/format";

interface FinanceMetricsProps {
  totals: PeriodTotals;
  className?: string;
}

/** Receita, despesas, saldo e economia do período (pendentes incluídos e indicados). */
export function FinanceMetrics({ totals, className }: FinanceMetricsProps) {
  const summary = summarizeCashflow(totals.income, totals.expenses);

  return (
    <dl className={cn("grid grid-cols-2 gap-3", className)}>
      <Metric
        label="Receita"
        value={formatCents(summary.income)}
        note={pendingNote(totals.incomePending, "a receber")}
        icon={ArrowUpRight}
        tone="success"
      />
      <Metric
        label="Despesas"
        value={formatCents(summary.expenses)}
        note={pendingNote(totals.expensesPending, "a pagar")}
        icon={ArrowDownRight}
        tone="danger"
      />
      <Metric
        label="Saldo líquido"
        value={formatCents(summary.net)}
        icon={Scale}
        tone={summary.net >= 0 ? "success" : "danger"}
      />
      <Metric
        label="Economia"
        value={summary.income > 0 ? formatPercent(summary.savingsRate) : "—"}
        note={summary.income > 0 ? "da receita" : "sem receita no mês"}
        icon={PiggyBank}
        tone="primary"
      />
    </dl>
  );
}

function pendingNote(pending: number, label: string): string | undefined {
  return pending > 0 ? `${formatCents(pending)} ${label}` : undefined;
}

type MetricTone = "success" | "danger" | "primary";

const metricToneClasses: Record<MetricTone, string> = {
  success: "text-success",
  danger: "text-danger",
  primary: "text-primary",
};

interface MetricProps {
  label: string;
  value: string;
  note?: string | undefined;
  icon: LucideIcon;
  tone: MetricTone;
}

function Metric({ label, value, note, icon: Icon, tone }: MetricProps) {
  return (
    <div className="grid content-start gap-1 rounded-md border border-border bg-background/40 p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={cn("size-3.5", metricToneClasses[tone])} aria-hidden="true" />
        {label}
      </dt>
      <dd className="grid gap-0.5">
        <span className="font-mono text-base font-semibold tabular">{value}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </dd>
    </div>
  );
}
