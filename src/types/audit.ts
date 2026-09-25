import { type IsoDateTime } from "@/types/common";
import { type JsonValue } from "@/types/json";

export type AuditOutcome = "success" | "failure" | "cancelled";

/** Espelha `AuditEntry` em src-tauri/src/repositories/audit.rs. */
export interface AuditEntry {
  id: number;
  occurredAt: IsoDateTime;
  category: string;
  action: string;
  target: string | null;
  outcome: AuditOutcome;
  details: JsonValue | null;
}
