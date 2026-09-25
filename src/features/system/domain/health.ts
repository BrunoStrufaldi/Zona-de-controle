import { type HealthStatus } from "@/features/system/types";
import { safeRatio } from "@/lib/math";

const ATTENTION_RATIO = 0.8;
const CRITICAL_RATIO = 0.9;

/** Classifica o uso de um recurso: ≥ 90% crítico, ≥ 80% atenção, abaixo disso saudável. */
export function usageHealth(used: number, total: number): HealthStatus {
  const ratio = safeRatio(used, total);
  if (ratio >= CRITICAL_RATIO) return "critical";
  if (ratio >= ATTENTION_RATIO) return "attention";
  return "healthy";
}

export const healthLabels: Record<HealthStatus, string> = {
  healthy: "Estável",
  attention: "Atenção",
  critical: "Crítico",
};
