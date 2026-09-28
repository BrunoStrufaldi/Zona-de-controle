import { type SystemSnapshot } from "@/features/system/types";
import { safeRatio } from "@/lib/math";

/** Ponto dos gráficos ao vivo (percentuais de 0 a 100). */
export interface UsageSample {
  /** Instante da leitura (ms desde a época Unix). */
  at: number;
  /** `null` enquanto a CPU ainda não foi medida (lacuna no gráfico). */
  cpu: number | null;
  memory: number;
}

/** Intervalo de leitura da tela Monitor. */
export const MONITOR_INTERVAL_MS = 2_000;

/** Pontos mantidos nos gráficos: 60 leituras de 2 s = 2 minutos. */
export const HISTORY_LENGTH = 60;

export function toUsageSample(snapshot: SystemSnapshot, at: number): UsageSample {
  const { memory } = snapshot;
  return {
    at,
    cpu: snapshot.cpu.usagePercent,
    memory: safeRatio(memory.usedBytes, memory.totalBytes) * 100,
  };
}

/** Acrescenta uma leitura e descarta as mais antigas além do limite. */
export function appendSample(
  history: readonly UsageSample[],
  sample: UsageSample,
  limit = HISTORY_LENGTH,
): UsageSample[] {
  const next = [...history, sample];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export type UsageSeriesKey = "cpu" | "memory";

export interface UsageSummary {
  current: number | null;
  average: number | null;
  peak: number | null;
}

/** Atual, média e pico de uma série, ignorando leituras ainda não medidas. */
export function summarizeUsage(history: readonly UsageSample[], key: UsageSeriesKey): UsageSummary {
  const values = history.map((sample) => sample[key]).filter((value) => value !== null);
  if (values.length === 0) return { current: null, average: null, peak: null };
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    current: history.at(-1)?.[key] ?? null,
    average: total / values.length,
    peak: Math.max(...values),
  };
}
