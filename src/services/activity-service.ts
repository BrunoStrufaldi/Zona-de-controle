import { invokeCommand } from "@/services/tauri/commands";
import { type ActivityEntry } from "@/types/activity";

/** Atividades recentes de todos os módulos, mais recentes primeiro. */
export function listRecentActivity(limit: number): Promise<ActivityEntry[]> {
  return invokeCommand("list_recent_activity", { limit });
}
