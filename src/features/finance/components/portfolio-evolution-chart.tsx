import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { firstDayOf } from "@/features/finance/domain/period";
import { type PortfolioMonth } from "@/features/finance/types";
import { chartAxisTick, chartColors, chartTooltipStyle } from "@/lib/chart-theme";
import { formatCents, formatCompactCents, formatMonthShort } from "@/lib/format";

/**
 * O valor da carteira é a série (azul, como "Receita" no fluxo de caixa; o
 * vermelho do app indica despesa). O aplicado é só uma referência: neutra e
 * tracejada, então as linhas não se distinguem apenas pela cor.
 */
const series = [
  { key: "value", label: "Valor da carteira", color: chartColors.series2, dash: undefined },
  { key: "invested", label: "Aplicado líquido", color: chartColors.axis, dash: "5 4" },
] as const;

function monthLabel(month: string): string {
  return formatMonthShort(firstDayOf(month));
}

/**
 * Valor da carteira x aplicado líquido ao fim de cada mês (uma escala só, em
 * reais). A distância entre as linhas é o resultado acumulado.
 */
export function PortfolioEvolutionChart({ months }: { months: readonly PortfolioMonth[] }) {
  return (
    <>
      <div className="h-60 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[...months]} margin={{ left: -8, right: 8, top: 8 }}>
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
              cursor={{ stroke: chartColors.grid }}
              itemSorter={(item) => (item.dataKey === "value" ? 0 : 1)}
              labelFormatter={(label) => (typeof label === "string" ? monthLabel(label) : "")}
              formatter={(value) =>
                typeof value === "number" ? formatCents(value) : String(value)
              }
            />
            {series.map((item) => (
              <Line
                key={item.key}
                // Retas entre os fechamentos: nada é inventado entre um mês e outro.
                type="linear"
                dataKey={item.key}
                name={item.label}
                stroke={item.color}
                strokeWidth={2}
                strokeDasharray={item.dash}
                dot={{ r: 3, strokeWidth: 0, fill: item.color }}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--zdc-surface-raised)" }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Valor da carteira e aplicado líquido ao fim de cada mês</caption>
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
          {months.map((row) => (
            <tr key={row.month}>
              <th scope="row">{monthLabel(row.month)}</th>
              <td>{formatCents(row.value)}</td>
              <td>{formatCents(row.invested)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function PortfolioEvolutionLegend() {
  return (
    <ul className="flex items-center gap-3 text-xs text-muted-foreground">
      {series.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <svg aria-hidden="true" width="14" height="4" className="shrink-0">
            <line
              x1="0"
              y1="2"
              x2="14"
              y2="2"
              stroke={item.color}
              strokeWidth="2"
              strokeDasharray={item.dash === undefined ? undefined : "4 3"}
            />
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
