import { type Task, type TaskInput, type TaskStatus } from "@/features/productivity/tasks/types";
import { invokeCommand } from "@/services/tauri/commands";

export function listTasks(): Promise<Task[]> {
  return invokeCommand("list_tasks");
}

/** Tags em uso por alguma tarefa (para filtros e sugestões). */
export function listTaskTags(): Promise<string[]> {
  return invokeCommand("list_task_tags");
}

export function createTask(input: TaskInput): Promise<Task> {
  return invokeCommand("create_task", { input });
}

export function updateTask(id: number, input: TaskInput): Promise<Task> {
  return invokeCommand("update_task", { id, input });
}

/** Move para `status`, antes de `beforeId` (ou para o fim da coluna quando `null`). */
export function moveTask(id: number, status: TaskStatus, beforeId: number | null): Promise<Task> {
  return invokeCommand("move_task", { id, status, beforeId });
}

/**
 * Exclusão definitiva e auditada. Só chame após confirmação explícita do
 * usuário (ver `DeleteTaskDialog`).
 */
export async function deleteTask(id: number): Promise<void> {
  await invokeCommand("delete_task", { id });
}
