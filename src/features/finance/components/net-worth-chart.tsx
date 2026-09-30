import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { monthName, monthTick } from "@/features/finance/domain/analytics";
import { type AnalyticsMonth } from "@/features/finance/types";
import { chartAxisTick, chartColors, chartTooltipStyle } from "@/lib/chart-theme";
import { formatCents, formatCompactCents } from "@/lib/format";

interface Row {
  month: string;
  total: number | null;
  accounts: number | null;
  investments: number | null;
}

function rows(months: readonly AnalyticsMonth[]): Row[] {
  return months.map((row) => ({
    month: row.month,
    total: row.netWorth?.total ?? null,
    accounts: row.netWorth?.accounts ?? null,
    investments: row.netWorth?.investments ?? null,
  }));
}

/** O que a dica usa das propriedades que o Recharts passa. */
interface TooltipProps {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}

/** Dica com o total e de onde ele vem (contas e investimentos). */
function NetWorthTooltip({ active, payload }: TooltipProps) {
  const row = payload?.[0]?.payload as Row | undefined;
  if (!active || row === undefined || row.total === null) return null;
  return (
    <div style={chartTooltipStyle.contentStyle} className="grid gap-1 px-3 py-2">
      <span style={chartTooltipStyle.labelStyle}>{monthName(row.month)}</span>
      <span className="font-mono font-semibold tabular">{formatCents(row.total)}</span>
      <span className="text-muted-foreground">
        Contas: <span className="font-mono tabular">{formatCents(row.accounts ?? 0)}</span>
      </span>
      <span className="text-muted-foreground">
        Investimentos:{" "}
        <span className="font-mono tabular">{formatCents(row.investments ?? 0)}</span>
      </span>
    </div>
  );
}

/**
 * Patrimônio ao fim de cada mês (uma série só: o título do card a nomeia).
 * Meses antes do primeiro registro ficam sem ponto, nunca com zero.
 */
export function NetWorthChart({ months }: { months: readonly AnalyticsMonth[] }) {
  const data = rows(months);
  return (
    <>
      <div className="h-60 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
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
            <Tooltip cursor={{ stroke: chartColors.grid }} content={NetWorthTooltip} />
            <Line
              // Retas entre os fechamentos: nada é inventado entre um mês e outro.
              type="linear"
              dataKey="total"
              name="Patrimônio"
              stroke={chartColors.series2}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: chartColors.series2 }}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--zdc-surface-raised)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Patrimônio ao fim de cada mês</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Contas</th>
            <th scope="col">Investimentos</th>
            <th scope="col">Patrimônio</th>
          </tr>
        </thead>
        <tbody>
          {data
            .filter((row) => row.total !== null)
            .map((row) => (
              <tr key={row.month}>
                <th scope="row">{monthName(row.month)}</th>
                <td>{formatCents(row.accounts ?? 0)}</td>
                <td>{formatCents(row.investments ?? 0)}</td>
                <td>{formatCents(row.total ?? 0)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </>
  );
}
