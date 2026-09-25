import { vi } from "vitest";

import { type Task, type TaskInput } from "@/features/productivity/tasks/types";
import { mockDesktopRuntime } from "@/test/tauri";

/**
 * Backend de tarefas em memória para testes de interface. Implementa os
 * commands com a mesma semântica básica do Rust (posição, conclusão, tags).
 */
export function mockTasksBackend(initial: Partial<Task>[] = []) {
  let nextId = 1;
  let tasks: Task[] = initial.map((partial) => build(partial));

  function build(partial: Partial<Task>): Task {
    const id = partial.id ?? nextId;
    nextId = Math.max(nextId, id + 1);
    return {
      id,
      title: `Tarefa ${id}`,
      description: "",
      status: "todo",
      priority: "medium",
      dueDate: null,
      position: id,
      tags: [],
      completedAt: partial.status === "done" ? "2026-09-25T12:00:00Z" : null,
      createdAt: "2026-09-25T12:00:00Z",
      updatedAt: "2026-09-25T12:00:00Z",
      ...partial,
    };
  }

  const endOf = (status: Task["status"]) =>
    Math.max(0, ...tasks.filter((task) => task.status === status).map((task) => task.position)) + 1;

  const fromInput = (input: TaskInput) => ({
    ...input,
    tags: [...new Set(input.tags.map((tag) => tag.toLowerCase()))].sort(),
  });

  const handlers = {
    list_tasks: vi.fn(() => tasks),
    list_task_tags: vi.fn(() => [...new Set(tasks.flatMap((task) => task.tags))].sort()),
    create_task: vi.fn(({ input }: { input: TaskInput }) => {
      const task = build({ ...fromInput(input), id: nextId, position: endOf(input.status) });
      tasks = [...tasks, task];
      return task;
    }),
    update_task: vi.fn(({ id, input }: { id: number; input: TaskInput }) => {
      tasks = tasks.map((task) => (task.id === id ? { ...task, ...fromInput(input) } : task));
      const updated = tasks.find((task) => task.id === id);
      // O Tauri rejeita com o AppError serializado (objeto puro).
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      if (!updated) throw { kind: "not_found", message: "tarefa não encontrada" };
      return updated;
    }),
    move_task: vi.fn(
      ({ id, status }: { id: number; status: Task["status"]; beforeId: number | null }) => {
        tasks = tasks.map((task) =>
          task.id === id
            ? {
                ...task,
                status,
                position: endOf(status),
                completedAt: status === "done" ? "2026-09-25T12:00:00Z" : null,
              }
            : task,
        );
        return tasks.find((task) => task.id === id) as Task;
      },
    ),
    delete_task: vi.fn(({ id }: { id: number }) => {
      tasks = tasks.filter((task) => task.id !== id);
      return null;
    }),
  };

  mockDesktopRuntime(handlers);
  return { handlers, current: () => tasks };
}
