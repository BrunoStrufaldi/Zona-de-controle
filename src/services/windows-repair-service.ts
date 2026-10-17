import {
  type RepairHistoryEntry,
  type RepairProgress,
  type RepairReadiness,
  type RepairReport,
} from "@/features/system/windows-repair/types";
import { invokeCommand } from "@/services/tauri/commands";

/** Ferramentas presentes e reinício pendente (somente leitura). */
export function checkWindowsRepair(): Promise<RepairReadiness> {
  return invokeCommand("check_windows_repair");
}

/**
 * Pede a elevação (UAC) e roda DISM + SFC. Resolve só no fim (10 a 30 min);
 * o andamento vem de `getWindowsRepairProgress`.
 */
export function runWindowsRepair(): Promise<RepairReport> {
  return invokeCommand("run_windows_repair");
}

export function getWindowsRepairProgress(): Promise<RepairProgress | null> {
  return invokeCommand("get_windows_repair_progress");
}

/** Pede para a DISM parar; o SFC já iniciado vai até o fim. */
export function cancelWindowsRepair(): Promise<boolean> {
  return invokeCommand("cancel_windows_repair");
}

export function listWindowsRepairHistory(limit: number): Promise<RepairHistoryEntry[]> {
  return invokeCommand("list_windows_repair_history", { limit });
}
