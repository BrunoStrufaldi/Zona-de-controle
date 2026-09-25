import { useCallback, useEffect, useMemo, useState } from "react";

import { applyChecklistToggle } from "@/features/productivity/tasks/domain/checklist";
import { applyMove, type MoveTarget } from "@/features/productivity/tasks/domain/ordering";
import {
  type Task,
  type TaskCategory,
  type TaskCategoryInput,
  type TaskChange,
  type TaskInput,
} from "@/features/productivity/tasks/types";
import { type AsyncResource, type AsyncResourceState } from "@/hooks/use-async-resource";
import { toServiceError } from "@/services/tauri/errors";
import {
  archiveCompletedTasks,
  archiveTask,
  createTask,
  createTaskCategory,
  deleteTask,
  deleteTaskCategory,
  listArchivedTasks,
  listTaskCategories,
  listTaskTags,
  listTasks,
  moveTask,
  restoreTask,
  setChecklistItemDone,
  updateTask,
  updateTaskCategory,
} from "@/services/tasks-service";

export interface TasksData {
  /** Tarefas ativas (lista e Kanban). */
  tasks: Task[];
  archived: Task[];
  /** Tags em uso (filtros e sugestões). */
  tags: string[];
  categories: TaskCategory[];
}

export interface TasksActions {
  create: (input: TaskInput) => Promise<TaskChange>;
  update: (id: number, input: TaskInput) => Promise<TaskChange>;
  move: (id: number, target: MoveTarget) => Promise<TaskChange>;
  /** Alterna entre concluída e "A fazer". */
  toggleDone: (task: Task) => Promise<TaskChange>;
  toggleChecklistItem: (itemId: number, done: boolean) => Promise<void>;
  archive: (id: number) => Promise<void>;
  /** Arquiva todas as concluídas; retorna quantas foram arquivadas. */
  archiveCompleted: () => Promise<number>;
  restore: (id: number) => Promise<void>;
  /** Exclusão definitiva — chame apenas após confirmação do usuário. */
  remove: (id: number) => Promise<void>;
  /** Cria (`id` nulo) ou edita uma categoria. */
  saveCategory: (id: number | null, input: TaskCategoryInput) => Promise<TaskCategory>;
  /** Exclusão definitiva da categoria — chame apenas após confirmação do usuário. */
  removeCategory: (id: number) => Promise<void>;
}

type Optimistic = ((data: TasksData) => TasksData) | null;

const withTasks =
  (update: (tasks: Task[]) => Task[]): Optimistic =>
  (data) => ({ ...data, tasks: update(data.tasks) });

/** Move tarefas entre ativas e arquivadas localmente. */
function transfer(
  data: TasksData,
  predicate: (task: Task) => boolean,
  to: "archived" | "tasks",
): TasksData {
  const from = to === "archived" ? data.tasks : data.archived;
  const moving = from.filter(predicate);
  const remaining = from.filter((task) => !predicate(task));
  const archivedAt = to === "archived" ? new Date().toISOString() : null;
  const moved = moving.map((task) => ({ ...task, archivedAt }));
  return to === "archived"
    ? { ...data, tasks: remaining, archived: [...moved, ...data.archived] }
    : { ...data, archived: remaining, tasks: [...data.tasks, ...moved] };
}

/**
 * Estado das tarefas da página. Movimentos, conclusão, checklist, arquivamento
 * e exclusão aparecem na tela imediatamente (otimista); após cada operação os
 * dados são recarregados do banco, o que também desfaz a mudança local se o
 * backend falhar. Erros das ações são relançados como `ServiceError`.
 */
export function useTasks(): { resource: AsyncResource<TasksData>; actions: TasksActions } {
  const [state, setState] = useState<AsyncResourceState<TasksData>>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([listTasks(), listArchivedTasks(), listTaskTags(), listTaskCategories()]).then(
      ([tasks, archived, tags, categories]) => {
        if (active) setState({ status: "success", data: { tasks, archived, tags, categories } });
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
    async <T>(optimistic: Optimistic, action: () => Promise<T>): Promise<T> => {
      if (optimistic) {
        setState((current) =>
          current.status === "success" ? { ...current, data: optimistic(current.data) } : current,
        );
      }
      try {
        return await action();
      } catch (error) {
        throw toServiceError(error);
      } finally {
        refresh();
      }
    },
    [refresh],
  );

  const actions = useMemo<TasksActions>(() => {
    const move = (id: number, target: MoveTarget) =>
      mutate(
        withTasks((tasks) => applyMove(tasks, id, target)),
        () => moveTask(id, target.status, target.beforeId),
      );

    return {
      create: (input) => mutate(null, () => createTask(input)),
      update: (id, input) => mutate(null, () => updateTask(id, input)),
      move,
      toggleDone: (task) =>
        move(task.id, { status: task.status === "done" ? "todo" : "done", beforeId: null }),
      toggleChecklistItem: (itemId, done) =>
        mutate(
          withTasks((tasks) => applyChecklistToggle(tasks, itemId, done)),
          async () => {
            await setChecklistItemDone(itemId, done);
          },
        ),
      archive: (id) =>
        mutate(
          (data) => transfer(data, (task) => task.id === id, "archived"),
          async () => {
            await archiveTask(id);
          },
        ),
      archiveCompleted: () =>
        mutate(
          (data) => transfer(data, (task) => task.status === "done", "archived"),
          archiveCompletedTasks,
        ),
      restore: (id) =>
        mutate(
          (data) => transfer(data, (task) => task.id === id, "tasks"),
          async () => {
            await restoreTask(id);
          },
        ),
      remove: (id) =>
        mutate(
          (data) => ({
            ...data,
            tasks: data.tasks.filter((task) => task.id !== id),
            archived: data.archived.filter((task) => task.id !== id),
          }),
          () => deleteTask(id),
        ),
      saveCategory: (id, input) =>
        mutate(null, () =>
          id === null ? createTaskCategory(input) : updateTaskCategory(id, input),
        ),
      removeCategory: (id) =>
        mutate(
          (data) => ({
            ...data,
            categories: data.categories.filter((category) => category.id !== id),
            tasks: data.tasks.map((task) =>
              task.categoryId === id ? { ...task, categoryId: null } : task,
            ),
          }),
          () => deleteTaskCategory(id),
        ),
    };
  }, [mutate]);

  const resource = useMemo(() => ({ ...state, reload }), [state, reload]);
  return { resource, actions };
}
