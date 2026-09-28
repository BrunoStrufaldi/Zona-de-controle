import { vi } from "vitest";

import {
  type DiagnosticFinding,
  type DiagnosticReport,
  type DiagnosticThresholds,
} from "@/features/system/diagnostics/types";
import { mockDesktopRuntime } from "@/test/tauri";

const GIB = 1024 ** 3;

export const DEFAULT_THRESHOLDS: DiagnosticThresholds = {
  diskAttentionPercent: 80,
  diskCriticalPercent: 90,
  systemDiskMinFreeGb: 15,
  memoryAttentionPercent: 80,
  memoryCriticalPercent: 90,
  pageFileAttentionPercent: 80,
  programMemoryPercent: 25,
  programCpuPercent: 50,
};

/** Achados típicos: C: sem espaço (crítico), memória alta e um programa pesado. */
export const SAMPLE_FINDINGS: DiagnosticFinding[] = [
  {
    severity: "critical",
    kind: "diskSpace",
    mountPoint: "C:",
    label: "",
    usedBytes: 212 * GIB,
    totalBytes: 223 * GIB,
    systemDrive: true,
    lowFreeSpace: true,
  },
  { severity: "attention", kind: "memory", usedBytes: 27 * GIB, totalBytes: 32 * GIB },
  {
    severity: "attention",
    kind: "programMemory",
    name: "jogo.exe",
    instances: 1,
    memoryBytes: 15 * GIB,
    totalMemoryBytes: 32 * GIB,
  },
];

/**
 * Backend do diagnóstico para testes de interface. Valida os limites como o
 * Rust (faixas e atenção < crítico) para exercitar a exibição de erros.
 */
export function mockDiagnosticsBackend(findings: DiagnosticFinding[] = SAMPLE_FINDINGS) {
  let thresholds = { ...DEFAULT_THRESHOLDS };

  const report = (): DiagnosticReport => ({
    findings,
    checkedDisks: 2,
    checkedPrograms: 140,
    cpuMeasured: true,
    thresholds,
  });

  const handlers = {
    run_diagnostics: vi.fn(report),
    get_diagnostic_thresholds: vi.fn(() => ({ thresholds, defaults: DEFAULT_THRESHOLDS })),
    set_diagnostic_thresholds: vi.fn((args: { thresholds: DiagnosticThresholds }) => {
      const next = args.thresholds;
      if (next.diskAttentionPercent >= next.diskCriticalPercent) {
        // O Tauri rejeita com o AppError serializado (objeto puro), não com um Error.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw {
          kind: "validation",
          message: "Disco: o limite de atenção deve ser menor que o crítico.",
        };
      }
      thresholds = { ...next };
      return { thresholds, defaults: DEFAULT_THRESHOLDS };
    }),
  };
  mockDesktopRuntime(handlers);
  return { handlers };
}
