import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { pointName, pointTick, type ProjectionPoint } from "@/features/finance/domain/projection";
import { chartAxisTick, chartColors, chartTooltipStyle } from "@/lib/chart-theme";
import { formatCents, formatCompactCents } from "@/lib/format";

/**
 * O saldo com a estimativa é a série principal (azul); o saldo só com os
 * valores conhecidos é a referência neutra e tracejada: as linhas não se
 * distinguem só pela cor.
 */
const series = [
  { key: "balance", label: "Com a estimativa", color: chartColors.series2, dash: undefined },
  { key: "balanceKnown", label: "Só valores conhecidos", color: chartColors.axis, dash: "5 4" },
] as const;

/** Saldo previsto das contas do dia a dia, de hoje ao fim de cada mês. */
export function ProjectionChart({ points }: { points: readonly ProjectionPoint[] }) {
  return (
    <>
      <div className="h-60 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[...points]} margin={{ left: -8, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} stroke={chartColors.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="key"
              tickFormatter={pointTick}
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
              cursor={{ stroke: chartColors.grid }}
              itemSorter={(item) => (item.dataKey === "balance" ? 0 : 1)}
              labelFormatter={(label) => (typeof label === "string" ? pointName(label) : "")}
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
        <caption>Saldo previsto de hoje ao fim de cada mês</caption>
        <thead>
          <tr>
            <th scope="col">Quando</th>
            {series.map((item) => (
              <th key={item.key} scope="col">
                {item.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.key}>
              <th scope="row">{pointName(point.key)}</th>
              <td>{formatCents(point.balance)}</td>
              <td>{formatCents(point.balanceKnown)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function ProjectionLegend() {
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
