import { vi } from "vitest";

import { nextOccurrence } from "@/features/productivity/tasks/domain/recurrence";
import {
  type ChecklistItemInput,
  type Task,
  type TaskCategory,
  type TaskCategoryInput,
  type TaskChange,
  type TaskInput,
} from "@/features/productivity/tasks/types";
import { toIsoDate } from "@/lib/dates";
import { mockDesktopRuntime } from "@/test/tauri";

const NOW = "2026-09-25T12:00:00Z";

/** O Tauri rejeita com o AppError serializado (objeto puro). */
function notFound(message: string): never {
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  throw { kind: "not_found", message };
}

/**
 * Backend de tarefas em memória para testes de interface. Implementa os
 * commands com a mesma semântica básica do Rust (posição, conclusão, tags,
 * checklist, recorrência, arquivamento e categorias).
 */
export function mockTasksBackend(
  initial: Partial<Task>[] = [],
  initialCategories: Partial<TaskCategory>[] = [],
) {
  let nextId = 1;
  let nextItemId = 1;
  let tasks: Task[] = initial.map((partial) => build(partial));
  let categories: TaskCategory[] = initialCategories.map((partial, index) => ({
    id: index + 1,
    name: `Categoria ${index + 1}`,
    color: "blue",
    taskCount: 0,
    ...partial,
  }));

  function build(partial: Partial<Task>): Task {
    const id = partial.id ?? nextId;
    nextId = Math.max(nextId, id + 1);
    const checklist = (partial.checklist ?? []).map((item) => {
      nextItemId = Math.max(nextItemId, item.id + 1);
      return item;
    });
    return {
      id,
      title: `Tarefa ${id}`,
      description: "",
      status: "todo",
      priority: "medium",
      dueDate: null,
      position: id,
      tags: [],
      categoryId: null,
      recurrence: null,
      completedAt: partial.status === "done" ? NOW : null,
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      ...partial,
      checklist,
    };
  }

  const active = () => tasks.filter((task) => task.archivedAt === null);
  const find = (id: number) =>
    tasks.find((task) => task.id === id) ?? notFound("tarefa não encontrada");

  const endOf = (status: Task["status"]) =>
    Math.max(0, ...tasks.filter((task) => task.status === status).map((task) => task.position)) + 1;

  const toItems = (items: readonly ChecklistItemInput[]) =>
    items.map((item) => ({ ...item, id: nextItemId++ }));

  const fromInput = (input: TaskInput) => ({
    ...input,
    tags: [...new Set(input.tags.map((tag) => tag.toLowerCase()))].sort(),
    checklist: toItems(input.checklist),
  });

  const replace = (id: number, patch: Partial<Task>) => {
    tasks = tasks.map((task) => (task.id === id ? { ...task, ...patch } : task));
    return find(id);
  };

  /** Concluir uma recorrente cria a próxima ocorrência e passa a regra para ela. */
  const finish = (id: number, previous: Task["status"] | null): TaskChange => {
    const task = find(id);
    if (task.status !== "done" || previous === "done" || !task.recurrence) {
      return { task, nextOccurrence: null };
    }
    const today = toIsoDate(new Date());
    const next = build({
      ...task,
      id: nextId,
      status: "todo",
      completedAt: null,
      position: endOf("todo"),
      dueDate: nextOccurrence(task.recurrence, task.dueDate ?? today, today),
      checklist: toItems(task.checklist.map(({ text }) => ({ text, done: false }))),
    });
    tasks = [...tasks, next];
    return { task: replace(id, { recurrence: null }), nextOccurrence: next };
  };

  const withCounts = () =>
    categories.map((category) => ({
      ...category,
      taskCount: tasks.filter((task) => task.categoryId === category.id).length,
    }));

  const handlers = {
    list_tasks: vi.fn(active),
    list_archived_tasks: vi.fn(() => tasks.filter((task) => task.archivedAt !== null)),
    list_task_tags: vi.fn(() => [...new Set(tasks.flatMap((task) => task.tags))].sort()),
    create_task: vi.fn(({ input }: { input: TaskInput }) => {
      const task = build({ ...fromInput(input), id: nextId, position: endOf(input.status) });
      tasks = [...tasks, task];
      return finish(task.id, null);
    }),
    update_task: vi.fn(({ id, input }: { id: number; input: TaskInput }) => {
      const previous = find(id).status;
      replace(id, {
        ...fromInput(input),
        completedAt: input.status === "done" ? NOW : null,
      });
      return finish(id, previous);
    }),
    move_task: vi.fn(
      ({ id, status }: { id: number; status: Task["status"]; beforeId: number | null }) => {
        const previous = find(id).status;
        replace(id, {
          status,
          position: endOf(status),
          completedAt: status === "done" ? NOW : null,
        });
        return finish(id, previous);
      },
    ),
    set_checklist_item_done: vi.fn(({ itemId, done }: { itemId: number; done: boolean }) => {
      const owner =
        tasks.find((task) => task.checklist.some((item) => item.id === itemId)) ??
        notFound("item da checklist não encontrado");
      return replace(owner.id, {
        checklist: owner.checklist.map((item) => (item.id === itemId ? { ...item, done } : item)),
      });
    }),
    archive_task: vi.fn(({ id }: { id: number }) => replace(id, { archivedAt: NOW })),
    archive_completed_tasks: vi.fn(() => {
      const done = active().filter((task) => task.status === "done");
      for (const task of done) replace(task.id, { archivedAt: NOW });
      return done.length;
    }),
    restore_task: vi.fn(({ id }: { id: number }) =>
      replace(id, { archivedAt: null, position: endOf(find(id).status) }),
    ),
    delete_task: vi.fn(({ id }: { id: number }) => {
      tasks = tasks.filter((task) => task.id !== id);
      return null;
    }),
    list_task_categories: vi.fn(withCounts),
    create_task_category: vi.fn(({ input }: { input: TaskCategoryInput }) => {
      const category: TaskCategory = {
        id: Math.max(0, ...categories.map((current) => current.id)) + 1,
        ...input,
        taskCount: 0,
      };
      categories = [...categories, category];
      return category;
    }),
    update_task_category: vi.fn(({ id, input }: { id: number; input: TaskCategoryInput }) => {
      categories = categories.map((category) =>
        category.id === id ? { ...category, ...input } : category,
      );
      return (
        withCounts().find((category) => category.id === id) ?? notFound("categoria não encontrada")
      );
    }),
    delete_task_category: vi.fn(({ id }: { id: number }) => {
      categories = categories.filter((category) => category.id !== id);
      tasks = tasks.map((task) => (task.categoryId === id ? { ...task, categoryId: null } : task));
      return null;
    }),
  };

  mockDesktopRuntime(handlers);
  return { handlers, current: () => tasks, categories: () => categories };
}
