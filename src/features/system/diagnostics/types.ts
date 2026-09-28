/**
 * Contratos do diagnóstico (Fase 3.2). Espelham `src-tauri/src/domain/diagnostics.rs`.
 * A análise usa só a leitura atual (não há histórico) e nunca altera o sistema.
 */

/** Limites configuráveis: percentuais de 1 a 100; espaço livre em GB. */
export interface DiagnosticThresholds {
  diskAttentionPercent: number;
  diskCriticalPercent: number;
  /** Abaixo disso, a unidade do sistema fica crítica. */
  systemDiskMinFreeGb: number;
  memoryAttentionPercent: number;
  memoryCriticalPercent: number;
  pageFileAttentionPercent: number;
  /** Um programa usando mais que isto da RAM é citado. */
  programMemoryPercent: number;
  /** Um programa usando mais que isto da CPU inteira é citado. */
  programCpuPercent: number;
}

export interface DiagnosticSettings {
  thresholds: DiagnosticThresholds;
  defaults: DiagnosticThresholds;
}

export type DiagnosticSeverity = "attention" | "critical";

export type DiagnosticFinding = { severity: DiagnosticSeverity } & (
  | {
      kind: "diskSpace";
      mountPoint: string;
      label: string;
      usedBytes: number;
      totalBytes: number;
      systemDrive: boolean;
      /** A unidade do sistema está abaixo do espaço livre mínimo. */
      lowFreeSpace: boolean;
    }
  | { kind: "memory"; usedBytes: number; totalBytes: number }
  | { kind: "pageFile"; usedBytes: number; totalBytes: number }
  | {
      kind: "programMemory";
      name: string;
      instances: number;
      memoryBytes: number;
      totalMemoryBytes: number;
    }
  | { kind: "programCpu"; name: string; instances: number; cpuPercent: number }
);

export type DiagnosticFindingKind = DiagnosticFinding["kind"];

export interface DiagnosticReport {
  /** Críticos primeiro; depois na ordem das verificações. */
  findings: DiagnosticFinding[];
  /** Unidades fixas verificadas (removíveis são ignoradas). */
  checkedDisks: number;
  checkedPrograms: number;
  /** `false` se o uso de CPU por programa não pôde ser medido. */
  cpuMeasured: boolean;
  thresholds: DiagnosticThresholds;
}
