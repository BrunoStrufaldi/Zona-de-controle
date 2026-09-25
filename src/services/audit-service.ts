import { invokeCommand } from "@/services/tauri/commands";
import { type AuditEntry } from "@/types/audit";

/** Registros mais recentes do log de auditoria (somente leitura). */
export function listAuditEntries(limit = 50): Promise<AuditEntry[]> {
  return invokeCommand("list_audit_entries", { limit });
}
