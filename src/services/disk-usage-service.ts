import {
  type DiskUsageProgress,
  type DiskUsageScan,
  type FolderChildren,
} from "@/features/system/disk-usage/types";
import { invokeCommand } from "@/services/tauri/commands";

/**
 * Analisa o que ocupa a unidade `mountPoint` ("C:"), somente leitura. Resolve
 * no fim com o resumo, ou `null` se a análise foi cancelada.
 */
export function scanDiskUsage(mountPoint: string): Promise<DiskUsageScan | null> {
  return invokeCommand("scan_disk_usage", { mountPoint });
}

/** Andamento da análise em curso (`null` se nenhuma estiver rodando). */
export function getDiskUsageProgress(): Promise<DiskUsageProgress | null> {
  return invokeCommand("get_disk_usage_progress");
}

/** Pede para a análise parar (a anterior continua valendo). */
export function cancelDiskUsage(): Promise<boolean> {
  return invokeCommand("cancel_disk_usage");
}

/** A última análise concluída desde que o app abriu (`null` se nenhuma). */
export function getDiskUsageScan(): Promise<DiskUsageScan | null> {
  return invokeCommand("get_disk_usage_scan");
}

/** Conteúdo de uma pasta da análise `scanId`, maiores primeiro. */
export function listDiskUsageChildren(
  scanId: number,
  folderId: number,
  limit: number,
): Promise<FolderChildren> {
  return invokeCommand("list_disk_usage_children", { scanId, folderId, limit });
}
