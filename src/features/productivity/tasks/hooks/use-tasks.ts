import { useCallback, useEffect, useMemo, useState } from "react";

import { applyMove, type MoveTarget } from "@/features/productivity/tasks/domain/ordering";
import { type Task, type TaskInput } from "@/features/productivity/tasks/types";
import { type AsyncResource, type AsyncResourceState } from "@/hooks/use-async-resource";
import { toServiceError } from "@/services/tauri/errors";
import {
  createTask,
  deleteTask,
  listTaskTags,
  listTasks,
  moveTask,
  updateTask,
} from "@/services/tasks-service";

export interface TasksData {
  tasks: Task[];
  /** Tags em uso (filtros e sugestões). */
  tags: string[];
}

export interface TasksActions {
  create: (input: TaskInput) => Promise<void>;
  update: (id: number, input: TaskInput) => Promise<void>;
  move: (id: number, target: MoveTarget) => Promise<void>;
  /** Alterna entre concluída e "A fazer". */
  toggleDone: (task: Task) => Promise<void>;
  /** Exclusão definitiva — chame apenas após confirmação do usuário. */
  remove: (id: number) => Promise<void>;
}

/**
 * Estado das tarefas da página. Movimentos, conclusão e exclusão aparecem na
 * tela imediatamente (otimista); após cada operação a lista é recarregada do
 * banco, o que também desfaz a mudança local se o backend falhar.
 * Erros das ações são relançados como `ServiceError` para quem chamou.
 */
export function useTasks(): { resource: AsyncResource<TasksData>; actions: TasksActions } {
  const [state, setState] = useState<AsyncResourceState<TasksData>>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([listTasks(), listTaskTags()]).then(
      ([tasks, tags]) => {
        if (active) setState({ status: "success", data: { tasks, tags } });
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

  const mutate = useCallback(
    async (optimistic: ((tasks: Task[]) => Task[]) | null, action: () => Promise<unknown>) => {
      if (optimistic) {
        setState((current) =>
          current.status === "success"
            ? { ...current, data: { ...current.data, tasks: optimistic(current.data.tasks) } }
            : current,
        );
      }
      try {
        await action();
      } catch (error) {
        throw toServiceError(error);
      } finally {
        refresh();
      }
    },
    [refresh],
  );

  const actions = useMemo<TasksActions>(
    () => ({
      create: (input) => mutate(null, () => createTask(input)),
      update: (id, input) => mutate(null, () => updateTask(id, input)),
      move: (id, target) =>
        mutate(
          (tasks) => applyMove(tasks, id, target),
          () => moveTask(id, target.status, target.beforeId),
        ),
      toggleDone: (task) => {
        const target: MoveTarget = {
          status: task.status === "done" ? "todo" : "done",
          beforeId: null,
        };
        return mutate(
          (tasks) => applyMove(tasks, task.id, target),
          () => moveTask(task.id, target.status, target.beforeId),
        );
      },
      remove: (id) =>
        mutate(
          (tasks) => tasks.filter((task) => task.id !== id),
          () => deleteTask(id),
        ),
    }),
    [mutate],
  );

  const resource = useMemo(() => ({ ...state, reload }), [state, reload]);
  return { resource, actions };
}
