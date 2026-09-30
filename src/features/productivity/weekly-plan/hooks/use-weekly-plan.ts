import { useMemo } from "react";

import { type PlanBlock, type PlanBlockInput } from "@/features/productivity/weekly-plan/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { useMutableResource } from "@/hooks/use-mutable-resource";
import {
  createPlanBlock,
  deletePlanBlock,
  listWeeklyPlan,
  updatePlanBlock,
} from "@/services/weekly-plan-service";

export interface WeeklyPlanActions {
  /** Cria (`id` nulo) ou edita um bloco. Conflitos de horário voltam como erro. */
  save: (id: number | null, input: PlanBlockInput) => Promise<PlanBlock>;
  /** Exclusão definitiva — chame apenas após confirmação do usuário. */
  remove: (id: number) => Promise<void>;
}

/** Blocos do planejamento semanal; cada mudança relê a lista do banco. */
export function useWeeklyPlan(): {
  resource: AsyncResource<PlanBlock[]>;
  actions: WeeklyPlanActions;
} {
  const { resource, mutate } = useMutableResource(listWeeklyPlan);
  const actions = useMemo<WeeklyPlanActions>(
    () => ({
      save: (id, input) =>
        mutate(null, () => (id === null ? createPlanBlock(input) : updatePlanBlock(id, input))),
      remove: async (id) => {
        await mutate(
          (blocks) => blocks.filter((block) => block.id !== id),
          () => deletePlanBlock(id),
        );
      },
    }),
    [mutate],
  );
  return { resource, actions };
}
