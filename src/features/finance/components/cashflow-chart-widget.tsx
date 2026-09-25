import { ChartColumn } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { WidgetCard } from "@/components/shared/widget-card";
import { type MonthlyCashflow } from "@/features/finance/types";
import { chartAxisTick, chartColors, chartTooltipStyle } from "@/lib/chart-theme";
import { cn } from "@/lib/cn";
import { formatCompactCurrency, formatCurrency, formatMonthShort } from "@/lib/format";

/** Cada série tem cor fixa pela entidade (receita/despesa), nunca pela posição. */
const series = [
  { key: "income", label: "Receita", color: chartColors.series2 },
  { key: "expenses", label: "Despesas", color: chartColors.series1 },
] as const;

interface CashflowChartWidgetProps {
  data: readonly MonthlyCashflow[];
  demo?: boolean;
  className?: string;
}

function formatTooltipValue(value: unknown): string {
  return typeof value === "number" ? formatCurrency(value) : String(value);
}

export function CashflowChartWidget({ data, demo = false, className }: CashflowChartWidgetProps) {
  return (
    <WidgetCard
      title="Receita x despesas · 6 meses"
      icon={ChartColumn}
      demo={demo}
      className={className}
      headerExtra={<ChartLegend />}
    >
      <div className="h-56 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={[...data]}
            barGap={2}
            barCategoryGap="28%"
            margin={{ left: -8, right: 4 }}
          >
            <CartesianGrid vertical={false} stroke={chartColors.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="month"
              tickFormatter={(value: string) => formatMonthShort(value)}
              tick={chartAxisTick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(value: number) => formatCompactCurrency(value)}
              tick={chartAxisTick}
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <Tooltip
              {...chartTooltipStyle}
              labelFormatter={(label) => (typeof label === "string" ? formatMonthShort(label) : "")}
              formatter={(value) => formatTooltipValue(value)}
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
      <CashflowTable data={data} />
    </WidgetCard>
  );
}

function ChartLegend() {
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

/** Tabela equivalente ao gráfico, para leitores de tela. */
function CashflowTable({
  data,
  className,
}: {
  data: readonly MonthlyCashflow[];
  className?: string;
}) {
  return (
    <table className={cn("sr-only", className)}>
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
        {data.map((row) => (
          <tr key={row.month}>
            <th scope="row">{formatMonthShort(row.month)}</th>
            <td>{formatCurrency(row.income)}</td>
            <td>{formatCurrency(row.expenses)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
