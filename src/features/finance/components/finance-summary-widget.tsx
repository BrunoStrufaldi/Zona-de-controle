import { ArrowDownRight, ArrowUpRight, PiggyBank, Scale, Wallet } from "lucide-react";
import { type LucideIcon } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import { summarizeCashflow } from "@/features/finance/domain/cashflow";
import { cn } from "@/lib/cn";
import { formatCurrency, formatPercent } from "@/lib/format";

interface FinanceSummaryWidgetProps {
  income: number;
  expenses: number;
  demo?: boolean;
}

export function FinanceSummaryWidget({
  income,
  expenses,
  demo = false,
}: FinanceSummaryWidgetProps) {
  const summary = summarizeCashflow(income, expenses);

  return (
    <WidgetCard title="Resumo financeiro do mês" icon={Wallet} demo={demo}>
      <dl className="grid grid-cols-2 gap-3">
        <Metric
          label="Receita"
          value={formatCurrency(summary.income)}
          icon={ArrowUpRight}
          tone="success"
        />
        <Metric
          label="Despesas"
          value={formatCurrency(summary.expenses)}
          icon={ArrowDownRight}
          tone="danger"
        />
        <Metric
          label="Saldo líquido"
          value={formatCurrency(summary.net)}
          icon={Scale}
          tone={summary.net >= 0 ? "success" : "danger"}
        />
        <Metric
          label="Economia"
          value={formatPercent(summary.savingsRate)}
          icon={PiggyBank}
          tone="primary"
        />
      </dl>
    </WidgetCard>
  );
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
  icon: LucideIcon;
  tone: MetricTone;
}

function Metric({ label, value, icon: Icon, tone }: MetricProps) {
  return (
    <div className="grid gap-1 rounded-md border border-border bg-background/40 p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={cn("size-3.5", metricToneClasses[tone])} aria-hidden="true" />
        {label}
      </dt>
      <dd className="font-mono text-base font-semibold tabular">{value}</dd>
    </div>
  );
}
