/**
 * Contratos do monitoramento do sistema (Fase 3).
 * Nenhuma métrica real é coletada nesta fase.
 */

export type HealthStatus = "healthy" | "attention" | "critical";

export interface ResourceUsage {
  /** Uso de CPU entre 0 e 100. */
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
}

export interface StorageVolume {
  /** Ponto de montagem / letra da unidade (ex.: "C:"). */
  mountPoint: string;
  label: string;
  usedBytes: number;
  totalBytes: number;
}

export interface SystemOverview {
  status: HealthStatus;
  usage: ResourceUsage;
  uptimeSeconds: number;
}

export type DiagnosticSeverity = "info" | "warning" | "critical";

export interface DiagnosticFinding {
  id: string;
  severity: DiagnosticSeverity;
  title: string;
  recommendation: string;
}
