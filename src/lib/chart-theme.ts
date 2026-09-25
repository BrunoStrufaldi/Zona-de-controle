/**
 * Cores e estilos compartilhados pelos gráficos (Recharts). Referenciam os
 * tokens CSS para que uma troca de tema reflita também nos gráficos.
 */
export const chartColors = {
  series1: "var(--zdc-chart-1)",
  series2: "var(--zdc-chart-2)",
  grid: "var(--zdc-chart-grid)",
  axis: "var(--zdc-text-muted)",
} as const;

export const chartAxisTick = {
  fill: chartColors.axis,
  fontSize: 11,
} as const;

export const chartTooltipStyle = {
  contentStyle: {
    background: "var(--zdc-surface-raised)",
    border: "1px solid var(--zdc-border)",
    borderRadius: "var(--zdc-radius)",
    color: "var(--zdc-text)",
    fontSize: 12,
  },
  labelStyle: { color: "var(--zdc-text-muted)", marginBottom: 4 },
  cursor: { fill: "rgb(var(--zdc-primary-rgb) / 0.06)" },
} as const;
