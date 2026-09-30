import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { firstDayOf } from "@/features/finance/domain/period";
import { type PortfolioMonth } from "@/features/finance/types";
import { chartAxisTick, chartColors, chartTooltipStyle } from "@/lib/chart-theme";
import { formatCents, formatCompactCents, formatMonthShort } from "@/lib/format";

function monthLabel(month: string): string {
  return formatMonthShort(firstDayOf(month));
}

/** Proventos recebidos por mês (uma série só: o título do card a nomeia). */
export function IncomeChart({ months }: { months: readonly PortfolioMonth[] }) {
  return (
    <>
      <div className="h-48 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[...months]} barCategoryGap="28%" margin={{ left: -8, right: 4 }}>
            <CartesianGrid vertical={false} stroke={chartColors.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="month"
              tickFormatter={monthLabel}
              tick={chartAxisTick}
              axisLine={false}
              tickLine={false}
              minTickGap={16}
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
            <Bar
              dataKey="income"
              name="Proventos"
              // Azul, como "Receita" no fluxo de caixa (o vermelho indica despesa).
              fill={chartColors.series2}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Proventos por mês</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Proventos</th>
          </tr>
        </thead>
        <tbody>
          {months.map((row) => (
            <tr key={row.month}>
              <th scope="row">{monthLabel(row.month)}</th>
              <td>{formatCents(row.income)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
