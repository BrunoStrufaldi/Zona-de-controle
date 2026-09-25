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
    categoryId: task.categoryId,
    recurrence: task.recurrence
      ? { ...task.recurrence, weekdays: [...task.recurrence.weekdays] }
      : null,
    checklist: task.checklist.map(({ text, done }) => ({ text, done })),
  };
}

/** Dados iniciais de uma nova tarefa. */
export function emptyTaskInput(status: TaskStatus = "todo"): TaskInput {
  return {
    title: "",
    description: "",
    status,
    priority: "medium",
    dueDate: null,
    tags: [],
    categoryId: null,
    recurrence: null,
    checklist: [],
  };
}
