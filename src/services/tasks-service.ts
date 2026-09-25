import {
  type Task,
  type TaskCategory,
  type TaskCategoryInput,
  type TaskChange,
  type TaskInput,
  type TaskStatus,
} from "@/features/productivity/tasks/types";
import { invokeCommand } from "@/services/tauri/commands";

/** Tarefas ativas (sem as arquivadas). */
export function listTasks(): Promise<Task[]> {
  return invokeCommand("list_tasks");
}

export function listArchivedTasks(): Promise<Task[]> {
  return invokeCommand("list_archived_tasks");
}

/** Tags em uso por alguma tarefa (para filtros e sugestões). */
export function listTaskTags(): Promise<string[]> {
  return invokeCommand("list_task_tags");
}

export function createTask(input: TaskInput): Promise<TaskChange> {
  return invokeCommand("create_task", { input });
}

/** Concluir uma tarefa recorrente pelo formulário também cria a próxima ocorrência. */
export function updateTask(id: number, input: TaskInput): Promise<TaskChange> {
  return invokeCommand("update_task", { id, input });
}

/**
 * Move para `status`, antes de `beforeId` (ou para o fim da coluna quando `null`).
 * Concluir uma tarefa recorrente cria a próxima ocorrência (`nextOccurrence`).
 */
export function moveTask(
  id: number,
  status: TaskStatus,
  beforeId: number | null,
): Promise<TaskChange> {
  return invokeCommand("move_task", { id, status, beforeId });
}

export function setChecklistItemDone(itemId: number, done: boolean): Promise<Task> {
  return invokeCommand("set_checklist_item_done", { itemId, done });
}

/** Arquivar é reversível: a tarefa sai das listas e pode ser restaurada. */
export function archiveTask(id: number): Promise<Task> {
  return invokeCommand("archive_task", { id });
}

/** Arquiva todas as concluídas. Retorna quantas foram arquivadas. */
export function archiveCompletedTasks(): Promise<number> {
  return invokeCommand("archive_completed_tasks");
}

export function restoreTask(id: number): Promise<Task> {
  return invokeCommand("restore_task", { id });
}

/**
 * Exclusão definitiva e auditada. Só chame após confirmação explícita do
 * usuário (ver `DeleteTaskDialog`).
 */
export async function deleteTask(id: number): Promise<void> {
  await invokeCommand("delete_task", { id });
}

export function listTaskCategories(): Promise<TaskCategory[]> {
  return invokeCommand("list_task_categories");
}

export function createTaskCategory(input: TaskCategoryInput): Promise<TaskCategory> {
  return invokeCommand("create_task_category", { input });
}

export function updateTaskCategory(id: number, input: TaskCategoryInput): Promise<TaskCategory> {
  return invokeCommand("update_task_category", { id, input });
}

/**
 * Exclusão definitiva e auditada da categoria (as tarefas ficam sem categoria).
 * Só chame após confirmação explícita do usuário.
 */
export async function deleteTaskCategory(id: number): Promise<void> {
  await invokeCommand("delete_task_category", { id });
}
