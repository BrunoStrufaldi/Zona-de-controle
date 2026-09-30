import { CreditCard } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { EmptyState } from "@/components/shared/empty-state";
import { WidgetCard } from "@/components/shared/widget-card";
import { monthName, monthTick } from "@/features/finance/domain/analytics";
import { installmentsReliefs, installmentsTotal } from "@/features/finance/domain/projection";
import { type ProjectionMonth, type YearMonth } from "@/features/finance/types";
import { chartAxisTick, chartColors, chartTooltipStyle } from "@/lib/chart-theme";
import { formatCents, formatCompactCents } from "@/lib/format";

interface InstallmentsImpactCardProps {
  months: readonly ProjectionMonth[];
  finalMonth: YearMonth | null;
}

/** Quanto das saídas de cada mês é parcela e quando elas diminuem. */
export function InstallmentsImpactCard({ months, finalMonth }: InstallmentsImpactCardProps) {
  const total = installmentsTotal(months);
  const reliefs = installmentsReliefs(months);
  const data = months.map((month) => ({
    month: month.month,
    installments: month.expenses.installments,
  }));

  return (
    <WidgetCard title="Impacto das parcelas" icon={CreditCard}>
      {total === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhuma parcela prevista"
          description="As parcelas vêm das faturas importadas do cartão."
          className="border-0 py-6"
        />
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            {`${formatCents(total)} em parcelas até ${monthName(months.at(-1)?.month ?? "")}`}
            {finalMonth !== null && `; a última vence em ${monthName(finalMonth)}.`}
          </p>
          <div className="h-48 w-full" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} barCategoryGap="28%" margin={{ left: -8, right: 4 }}>
                <CartesianGrid vertical={false} stroke={chartColors.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickFormatter={monthTick}
                  tick={chartAxisTick}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(value: number) => formatCompactCents(value)}
                  tick={chartAxisTick}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <Tooltip
                  {...chartTooltipStyle}
                  labelFormatter={(label) => (typeof label === "string" ? monthName(label) : "")}
                  formatter={(value) =>
                    typeof value === "number" ? formatCents(value) : String(value)
                  }
                />
                <Bar
                  dataKey="installments"
                  name="Parcelas"
                  fill={chartColors.series1}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>Parcelas por mês</caption>
            <thead>
              <tr>
                <th scope="col">Mês</th>
                <th scope="col">Parcelas</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.month}>
                  <th scope="row">{monthName(row.month)}</th>
                  <td>{formatCents(row.installments)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {reliefs.length > 0 && (
            <ul className="grid gap-1 text-sm" aria-label="Quando as parcelas diminuem">
              {reliefs.map((relief) => (
                <li key={relief.month} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Em {monthName(relief.month)}</span>
                  <span className="font-mono tabular">{formatCents(relief.amount)} a menos</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </WidgetCard>
  );
}
