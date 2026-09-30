import { ChartPie } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { EmptyState } from "@/components/shared/empty-state";
import { WidgetCard } from "@/components/shared/widget-card";
import { categoryDotClass } from "@/features/finance/components/finance-styles";
import {
  type CategoryTrendRow,
  changeText,
  monthName,
  monthTick,
} from "@/features/finance/domain/analytics";
import { type YearMonth } from "@/features/finance/types";
import { chartAxisTick, chartColors, chartTooltipStyle } from "@/lib/chart-theme";
import { cn } from "@/lib/cn";
import { formatCents, formatCompactCents, formatPercent } from "@/lib/format";

interface CategoryTrendsCardProps {
  rows: readonly CategoryTrendRow[];
  months: readonly YearMonth[];
  /** Descrição do período anterior usado na comparação. */
  previousLabel: string;
}

/**
 * Despesas por categoria no período, com a variação sobre o período anterior.
 * A categoria escolhida mostra os gastos mês a mês.
 */
export function CategoryTrendsCard({ rows, months, previousLabel }: CategoryTrendsCardProps) {
  // `undefined` = nenhuma escolhida (vale a maior); `null` = "Sem categoria".
  const [chosen, setChosen] = useState<number | null | undefined>(undefined);
  const selected = rows.find((row) => row.id === chosen) ?? rows[0];

  return (
    <WidgetCard title="Despesas por categoria" icon={ChartPie}>
      {selected === undefined ? (
        <EmptyState
          icon={ChartPie}
          title="Nenhuma despesa neste período"
          className="border-0 py-6"
        />
      ) : (
        <div className="grid gap-6 @3xl:grid-cols-2">
          <div className="grid content-start gap-2">
            <p className="text-xs text-muted-foreground">
              Variação sobre o período anterior ({previousLabel}). Escolha uma categoria para ver
              mês a mês.
            </p>
            <ul className="grid gap-1" aria-label="Despesas por categoria">
              {rows.map((row) => (
                <li key={row.id ?? "none"}>
                  <button
                    type="button"
                    aria-pressed={row === selected}
                    onClick={() => {
                      setChosen(row.id);
                    }}
                    className={cn(
                      "grid w-full gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors",
                      "hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      row === selected && "bg-raised",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-2.5 shrink-0 rounded-full",
                          row.color ? categoryDotClass[row.color] : "bg-subtle-foreground",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{row.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {changeText(row.change)}
                      </span>
                      <span className="w-12 text-right font-mono text-xs text-muted-foreground tabular">
                        {formatPercent(row.share)}
                      </span>
                      <span className="w-28 text-right font-mono tabular">
                        {formatCents(row.total)}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-1.5 overflow-hidden rounded-full bg-raised"
                    >
                      <span
                        className={cn(
                          "block h-full rounded-full",
                          row.color ? categoryDotClass[row.color] : "bg-subtle-foreground",
                        )}
                        style={{ width: `${Math.max(row.share * 100, 1)}%` }}
                      />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid content-start gap-2">
            <h3 className="text-sm font-medium">{selected.name} · mês a mês</h3>
            <CategoryMonthsChart row={selected} months={months} />
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

/** Gastos de uma categoria por mês (uma série só: despesa, em vermelho). */
function CategoryMonthsChart({
  row,
  months,
}: {
  row: CategoryTrendRow;
  months: readonly YearMonth[];
}) {
  const data = months.map((month, index) => ({ month, total: row.months[index] ?? 0 }));
  return (
    <>
      <div className="h-56 w-full" aria-hidden="true">
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
              dataKey="total"
              name={row.name}
              fill={chartColors.series1}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{`Despesas de ${row.name} por mês`}</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Despesas</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.month}>
              <th scope="row">{monthName(item.month)}</th>
              <td>{formatCents(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
