import {
  type CleanupItemPage,
  type CleanupProgress,
  type CleanupReport,
  type CleanupScan,
  type CleanupSource,
} from "@/features/system/optimization/types";
import { invokeCommand } from "@/services/tauri/commands";

/** Analisa temporários, caches seguros e Lixeira (somente leitura: nada é removido). */
export function scanCleanup(): Promise<CleanupScan> {
  return invokeCommand("scan_cleanup");
}

/** Uma página dos itens de uma origem da análise `scanId`, maiores primeiro. */
export function listCleanupItems(
  scanId: number,
  source: CleanupSource,
  offset: number,
  limit: number,
): Promise<CleanupItemPage> {
  return invokeCommand("list_cleanup_items", { scanId, source, offset, limit });
}

/**
 * Remove os itens das origens escolhidas da análise `scanId` — DESTRUTIVO.
 * Só deve ser chamado depois da confirmação explícita do usuário. Resolve ao
 * fim (ou no cancelamento) com o relatório.
 */
export function runCleanup(scanId: number, sources: CleanupSource[]): Promise<CleanupReport> {
  return invokeCommand("run_cleanup", { scanId, sources });
}

/** Andamento da limpeza em curso (`null` se nenhuma estiver rodando). */
export function getCleanupProgress(): Promise<CleanupProgress | null> {
  return invokeCommand("get_cleanup_progress");
}

/** Pede para a limpeza parar antes do próximo arquivo. */
export function cancelCleanup(): Promise<boolean> {
  return invokeCommand("cancel_cleanup");
}
