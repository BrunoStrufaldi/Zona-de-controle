import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  summarizeUsage,
  type UsageSample,
  type UsageSeriesKey,
} from "@/features/system/domain/history";
import { chartAxisTick, chartColors, chartTooltipStyle } from "@/lib/chart-theme";
import { formatClockTime, formatPercent } from "@/lib/format";

/** Cor fixa por recurso (nunca pela posição): CPU na série 1, memória na série 2. */
const seriesColor: Record<UsageSeriesKey, string> = {
  cpu: chartColors.series1,
  memory: chartColors.series2,
};

interface UsageHistoryChartProps {
  history: readonly UsageSample[];
  series: UsageSeriesKey;
  /** Nome do recurso, usado no tooltip e na descrição acessível (ex.: "CPU"). */
  label: string;
}

function percentText(value: number | null): string {
  return value === null ? "—" : formatPercent(value / 100, 0);
}

/**
 * Área com o uso dos últimos 2 minutos (escala fixa de 0 a 100%). Sem
 * animação: cada leitura nova desliza o gráfico e animar causaria tremulação.
 */
export function UsageHistoryChart({ history, series, label }: UsageHistoryChartProps) {
  const summary = summarizeUsage(history, series);
  const color = seriesColor[series];

  return (
    <figure className="grid gap-2">
      <div
        className="h-32 w-full"
        role="img"
        aria-label={`${label} nos últimos 2 minutos: média ${percentText(summary.average)}, pico ${percentText(summary.peak)}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={[...history]} margin={{ top: 8, right: 4, bottom: 8, left: 0 }}>
            <CartesianGrid vertical={false} stroke={chartColors.grid} strokeDasharray="3 3" />
            <XAxis dataKey="at" type="number" domain={["dataMin", "dataMax"]} hide />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              interval={0}
              tickFormatter={(value: number) => `${value}%`}
              tick={chartAxisTick}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              {...chartTooltipStyle}
              cursor={{ stroke: chartColors.axis, strokeDasharray: "3 3" }}
              labelFormatter={(value) => (typeof value === "number" ? formatClockTime(value) : "")}
              formatter={(value) => [
                typeof value === "number" ? formatPercent(value / 100, 1) : "—",
                label,
              ]}
            />
            <Area
              dataKey={series}
              type="monotone"
              stroke={color}
              strokeWidth={2}
              fill={color}
              fillOpacity={0.12}
              isAnimationActive={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--zdc-surface)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-subtle-foreground">
        <span>Últimos 2 minutos</span>
        <span className="font-mono tabular">
          média {percentText(summary.average)} · pico {percentText(summary.peak)}
        </span>
      </figcaption>
    </figure>
  );
}
