import {
  type DiagnosticReport,
  type DiagnosticSettings,
  type DiagnosticThresholds,
} from "@/features/system/diagnostics/types";
import { invokeCommand } from "@/services/tauri/commands";

/** Analisa discos, memória e programas com a leitura atual (somente leitura). */
export function runDiagnostics(): Promise<DiagnosticReport> {
  return invokeCommand("run_diagnostics");
}

/** Limites em uso e os padrões. */
export function getDiagnosticThresholds(): Promise<DiagnosticSettings> {
  return invokeCommand("get_diagnostic_thresholds");
}

/** Grava os limites (validados no Rust e auditados). */
export function setDiagnosticThresholds(
  thresholds: DiagnosticThresholds,
): Promise<DiagnosticSettings> {
  return invokeCommand("set_diagnostic_thresholds", { thresholds });
}
