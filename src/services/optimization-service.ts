import {
  type CleanupItemPage,
  type CleanupScan,
  type CleanupSource,
} from "@/features/system/optimization/types";
import { invokeCommand } from "@/services/tauri/commands";

/**
 * Analisa temporários, caches seguros e Lixeira (somente leitura: nada é
 * removido). A limpeza, quando existir, ficará em funções separadas e só será
 * chamada após confirmação explícita do usuário.
 */
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
