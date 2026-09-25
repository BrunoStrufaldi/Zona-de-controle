import { type AuditEntry } from "@/types/audit";

/**
 * Rótulo legível do alvo de um registro de auditoria. Quando os detalhes
 * trazem um título ou nome (ex.: tarefa ou categoria excluída), ele é exibido
 * junto do id.
 */
export function auditTargetLabel(entry: Pick<AuditEntry, "target" | "details">): string {
  const { details } = entry;
  const title =
    details !== null && typeof details === "object" && !Array.isArray(details)
      ? (details["title"] ?? details["name"])
      : undefined;

  if (typeof title === "string" && title !== "") {
    return entry.target ? `${title} (#${entry.target})` : title;
  }
  return entry.target ?? "—";
}
