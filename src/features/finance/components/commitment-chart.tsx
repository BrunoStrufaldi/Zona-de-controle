import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { monthLongLabel, monthShortLabel } from "@/features/finance/domain/installments";
import { type CommitmentMonth } from "@/features/finance/types";
import { chartAxisTick, chartColors, chartTooltipStyle } from "@/lib/chart-theme";
import { formatCents, formatCompactCents } from "@/lib/format";

/** Cor fixa por entidade (parcelas / recorrentes), empilhadas: parcelas embaixo. */
const series = [
  { key: "installments", label: "Parcelas", color: chartColors.series1 },
  { key: "recurring", label: "Recorrentes no cartão", color: chartColors.series2 },
] as const;

/** Compromisso das faturas mês a mês (centavos), com tabela para leitores de tela. */
export function CommitmentChart({ months }: { months: readonly CommitmentMonth[] }) {
  return (
    <>
      <div className="h-56 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[...months]} barCategoryGap="28%" margin={{ left: -8, right: 4 }}>
            <CartesianGrid vertical={false} stroke={chartColors.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="month"
              tickFormatter={monthShortLabel}
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
              labelFormatter={(label) => (typeof label === "string" ? monthLongLabel(label) : "")}
              formatter={(value) =>
                typeof value === "number" ? formatCents(value) : String(value)
              }
            />
            {series.map((item, index) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.label}
                stackId="commitment"
                fill={item.color}
                // Separação de 2px entre os segmentos, na cor da superfície.
                stroke="var(--zdc-surface)"
                strokeWidth={2}
                radius={index === series.length - 1 ? [4, 4, 0, 0] : 0}
                maxBarSize={32}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Compromisso das faturas por mês</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            {series.map((item) => (
              <th key={item.key} scope="col">
                {item.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.month}>
              <th scope="row">{monthLongLabel(month.month)}</th>
              <td>{formatCents(month.installments)}</td>
              <td>{formatCents(month.recurring)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function CommitmentLegend() {
  return (
    <ul className="flex items-center gap-3 text-xs text-muted-foreground">
      {series.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
