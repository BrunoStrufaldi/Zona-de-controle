import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { firstDayOf } from "@/features/finance/domain/period";
import { type MonthlyCashflow } from "@/features/finance/types";
import { chartAxisTick, chartColors, chartTooltipStyle } from "@/lib/chart-theme";
import { formatCents, formatCompactCents, formatMonthShort } from "@/lib/format";

/** Cada série tem cor fixa pela entidade (receita/despesa), nunca pela posição. */
const series = [
  { key: "income", label: "Receita", color: chartColors.series2 },
  { key: "expenses", label: "Despesas", color: chartColors.series1 },
] as const;

function monthLabel(month: string): string {
  return formatMonthShort(firstDayOf(month));
}

/** Receita x despesas por mês (valores em centavos), com tabela para leitores de tela. */
export function CashflowChart({ history }: { history: readonly MonthlyCashflow[] }) {
  return (
    <>
      <div className="h-56 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={[...history]}
            barGap={2}
            barCategoryGap="28%"
            margin={{ left: -8, right: 4 }}
          >
            <CartesianGrid vertical={false} stroke={chartColors.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="month"
              tickFormatter={monthLabel}
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
              labelFormatter={(label) => (typeof label === "string" ? monthLabel(label) : "")}
              formatter={(value) =>
                typeof value === "number" ? formatCents(value) : String(value)
              }
            />
            {series.map((item) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.label}
                fill={item.color}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Receita e despesas por mês</caption>
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
          {history.map((row) => (
            <tr key={row.month}>
              <th scope="row">{monthLabel(row.month)}</th>
              <td>{formatCents(row.income)}</td>
              <td>{formatCents(row.expenses)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function CashflowLegend() {
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
