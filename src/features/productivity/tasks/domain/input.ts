import { type Task, type TaskInput, type TaskStatus } from "@/features/productivity/tasks/types";

/** Dados de edição a partir de uma tarefa existente. */
export function toTaskInput(task: Task): TaskInput {
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    tags: [...task.tags],
  };
}

/** Dados iniciais de uma nova tarefa. */
export function emptyTaskInput(status: TaskStatus = "todo"): TaskInput {
  return { title: "", description: "", status, priority: "medium", dueDate: null, tags: [] };
}
