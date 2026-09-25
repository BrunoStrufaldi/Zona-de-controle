import { useCallback, useEffect, useMemo, useState } from "react";

import { applyHabitToggle } from "@/features/productivity/routines/domain/routines";
import { type Routine, type RoutineInput } from "@/features/productivity/routines/types";
import { type AsyncResource, type AsyncResourceState } from "@/hooks/use-async-resource";
import {
  createRoutine,
  deleteRoutine,
  listRoutines,
  setHabitDone,
  updateRoutine,
} from "@/services/routines-service";
import { toServiceError } from "@/services/tauri/errors";

export interface RoutinesActions {
  /** Cria (`id` nulo) ou edita uma rotina. */
  save: (id: number | null, input: RoutineInput) => Promise<Routine>;
  toggleHabit: (habitId: number, date: string, done: boolean) => Promise<void>;
  /** Exclusão definitiva — chame apenas após confirmação do usuário. */
  remove: (id: number) => Promise<void>;
}

/**
 * Rotinas da página. Marcações aparecem na hora (otimista) e são substituídas
 * pela rotina devolvida pelo backend, que já traz sequência e consistência
 * recalculadas. Se algo falhar, a lista é recarregada. Erros viram `ServiceError`.
 */
export function useRoutines(): { resource: AsyncResource<Routine[]>; actions: RoutinesActions } {
  const [state, setState] = useState<AsyncResourceState<Routine[]>>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    listRoutines().then(
      (routines) => {
        if (active) setState({ status: "success", data: routines });
      },
      (error: unknown) => {
        if (active) setState({ status: "error", error: toServiceError(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    refresh();
  }, [refresh]);

  const apply = useCallback((update: (routines: Routine[]) => Routine[]) => {
    setState((current) =>
      current.status === "success" ? { ...current, data: update(current.data) } : current,
    );
  }, []);

  /** Substitui (ou acrescenta) a rotina devolvida pelo backend. */
  const upsert = useCallback(
    (routine: Routine) => {
      apply((routines) =>
        routines.some((current) => current.id === routine.id)
          ? routines.map((current) => (current.id === routine.id ? routine : current))
          : [...routines, routine],
      );
    },
    [apply],
  );

  const actions = useMemo<RoutinesActions>(
    () => ({
      save: async (id, input) => {
        try {
          const routine = await (id === null ? createRoutine(input) : updateRoutine(id, input));
          upsert(routine);
          return routine;
        } catch (error) {
          throw toServiceError(error);
        }
      },
      toggleHabit: async (habitId, date, done) => {
        apply((routines) => applyHabitToggle(routines, habitId, date, done));
        try {
          upsert(await setHabitDone(habitId, date, done));
        } catch (error) {
          refresh();
          throw toServiceError(error);
        }
      },
      remove: async (id) => {
        apply((routines) => routines.filter((routine) => routine.id !== id));
        try {
          await deleteRoutine(id);
        } catch (error) {
          throw toServiceError(error);
        } finally {
          refresh();
        }
      },
    }),
    [apply, upsert, refresh],
  );

  const resource = useMemo(() => ({ ...state, reload }), [state, reload]);
  return { resource, actions };
}
