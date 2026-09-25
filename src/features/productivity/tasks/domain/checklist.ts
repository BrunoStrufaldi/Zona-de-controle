import { type ChecklistItem, type Task } from "@/features/productivity/tasks/types";

export interface ChecklistProgress {
  done: number;
  total: number;
}

export function checklistProgress(
  items: readonly Pick<ChecklistItem, "done">[],
): ChecklistProgress {
  return { done: items.filter((item) => item.done).length, total: items.length };
}

/** Marca/desmarca um item localmente (atualização otimista). */
export function applyChecklistToggle(
  tasks: readonly Task[],
  itemId: number,
  done: boolean,
): Task[] {
  return tasks.map((task) =>
    task.checklist.some((item) => item.id === itemId)
      ? {
          ...task,
          checklist: task.checklist.map((item) => (item.id === itemId ? { ...item, done } : item)),
        }
      : task,
  );
}
