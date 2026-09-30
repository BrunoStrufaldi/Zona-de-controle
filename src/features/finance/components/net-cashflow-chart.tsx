import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { monthName, monthTick } from "@/features/finance/domain/analytics";
import { type AnalyticsMonth } from "@/features/finance/types";
import { chartAxisTick, chartColors, chartTooltipStyle } from "@/lib/chart-theme";
import { formatCents, formatCompactCents } from "@/lib/format";

/** Sobra em azul (como "Receita"), falta em vermelho (como "Despesas"). */
const signs = [
  { key: "surplus", label: "Sobrou", color: chartColors.series2 },
  { key: "deficit", label: "Faltou", color: chartColors.series1 },
] as const;

/**
 * Cada mês vira `surplus` ou `deficit` (o outro fica nulo e some da dica), em
 * barras empilhadas: a cor segue o sinal sem precisar de uma cor por barra.
 */
function rows(months: readonly AnalyticsMonth[]) {
  return months.map((row) => ({
    month: row.month,
    surplus: row.net >= 0 ? row.net : null,
    deficit: row.net < 0 ? row.net : null,
  }));
}

/** Receita − despesas de cada mês; barras abaixo do zero são meses no vermelho. */
export function NetCashflowChart({ months }: { months: readonly AnalyticsMonth[] }) {
  return (
    <>
      <div className="h-56 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows(months)} barCategoryGap="28%" margin={{ left: -8, right: 4 }}>
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
            <ReferenceLine y={0} stroke={chartColors.axis} />
            <Tooltip
              {...chartTooltipStyle}
              labelFormatter={(label) => (typeof label === "string" ? monthName(label) : "")}
              formatter={(value) =>
                typeof value === "number" ? formatCents(value) : String(value)
              }
            />
            {signs.map((item) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.label}
                stackId="net"
                fill={item.color}
                radius={4}
                maxBarSize={28}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Receita menos despesas por mês</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Receita − despesas</th>
          </tr>
        </thead>
        <tbody>
          {months.map((row) => (
            <tr key={row.month}>
              <th scope="row">{monthName(row.month)}</th>
              <td>{formatCents(row.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function NetCashflowLegend() {
  return (
    <ul className="flex items-center gap-3 text-xs text-muted-foreground">
      {signs.map((item) => (
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
