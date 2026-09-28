import { type HealthStatus, type SystemSnapshot } from "@/features/system/types";
import { safeRatio } from "@/lib/math";

const ATTENTION_RATIO = 0.8;
const CRITICAL_RATIO = 0.9;

const HEALTH_ORDER: readonly HealthStatus[] = ["healthy", "attention", "critical"];

/** Classifica o uso de um recurso: ≥ 90% crítico, ≥ 80% atenção, abaixo disso saudável. */
export function usageHealth(used: number, total: number): HealthStatus {
  const ratio = safeRatio(used, total);
  if (ratio >= CRITICAL_RATIO) return "critical";
  if (ratio >= ATTENTION_RATIO) return "attention";
  return "healthy";
}

/** O pior estado da lista (lista vazia = saudável). */
export function worstHealth(statuses: readonly HealthStatus[]): HealthStatus {
  return statuses.reduce<HealthStatus>(
    (worst, status) =>
      HEALTH_ORDER.indexOf(status) > HEALTH_ORDER.indexOf(worst) ? status : worst,
    "healthy",
  );
}

/**
 * Estado geral a partir de CPU e memória. A CPU só conta depois de medida
 * (antes disso não há leitura, e nunca se presume um valor).
 */
export function systemHealth(snapshot: SystemSnapshot): HealthStatus {
  const { cpu, memory } = snapshot;
  const statuses = [usageHealth(memory.usedBytes, memory.totalBytes)];
  if (cpu.usagePercent !== null) statuses.push(usageHealth(cpu.usagePercent, 100));
  return worstHealth(statuses);
}

export const healthLabels: Record<HealthStatus, string> = {
  healthy: "Estável",
  attention: "Atenção",
  critical: "Crítico",
};
