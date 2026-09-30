import { type PlanBlock, type PlanBlockInput } from "@/features/productivity/weekly-plan/types";
import { invokeCommand } from "@/services/tauri/commands";

/** Blocos do planejamento semanal fixo. */
export function listWeeklyPlan(): Promise<PlanBlock[]> {
  return invokeCommand("list_weekly_plan");
}

/** Cria um bloco (o Rust recusa horário sobreposto a outro no mesmo dia). */
export function createPlanBlock(input: PlanBlockInput): Promise<PlanBlock> {
  return invokeCommand("create_plan_block", { input });
}

export function updatePlanBlock(id: number, input: PlanBlockInput): Promise<PlanBlock> {
  return invokeCommand("update_plan_block", { id, input });
}

/** Exclusão definitiva (auditada) — chame apenas após confirmação do usuário. */
export function deletePlanBlock(id: number): Promise<null> {
  return invokeCommand("delete_plan_block", { id });
}
