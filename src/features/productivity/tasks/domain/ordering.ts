import { groupByStatus, type TaskColumns } from "@/features/productivity/tasks/domain/filters";
import { TASK_STATUSES, type Task, type TaskStatus } from "@/features/productivity/tasks/types";

/** Destino de um movimento: coluna e tarefa antes da qual inserir (`null` = fim). */
export interface MoveTarget {
  status: TaskStatus;
  beforeId: number | null;
}

/** Onde o item foi solto: sobre outra tarefa ou sobre a área vazia de uma coluna. */
export type DropLocation = { type: "task"; id: number } | { type: "column"; status: TaskStatus };

function findColumn(columns: TaskColumns, id: number): TaskStatus | undefined {
  return TASK_STATUSES.find((status) => columns[status].some((task) => task.id === id));
}

/**
 * Converte o resultado de um arrastar-e-soltar em um destino para `move_task`.
 * Retorna `null` quando não há mudança.
 *
 * - Na mesma coluna, segue a semântica de reordenação: arrastando para baixo,
 *   o item fica depois do alvo; para cima, antes.
 * - Em outra coluna, o item entra antes do alvo (ou no fim, se solto na coluna).
 */
export function resolveDrop(
  columns: TaskColumns,
  activeId: number,
  over: DropLocation,
): MoveTarget | null {
  const fromStatus = findColumn(columns, activeId);
  if (fromStatus === undefined) return null;

  if (over.type === "column") {
    const target = columns[over.status];
    const isAlreadyLast = target[target.length - 1]?.id === activeId;
    return isAlreadyLast ? null : { status: over.status, beforeId: null };
  }

  if (over.id === activeId) return null;
  const toStatus = findColumn(columns, over.id);
  if (toStatus === undefined) return null;
  const target = columns[toStatus];
  const overIndex = target.findIndex((task) => task.id === over.id);

  if (toStatus !== fromStatus) return { status: toStatus, beforeId: over.id };

  const activeIndex = target.findIndex((task) => task.id === activeId);
  if (activeIndex < overIndex) {
    // Movendo para baixo: entra depois do alvo.
    return { status: toStatus, beforeId: target[overIndex + 1]?.id ?? null };
  }
  return { status: toStatus, beforeId: over.id };
}

/**
 * Aplica um movimento localmente (atualização otimista), espelhando o backend:
 * reposiciona a tarefa e ajusta `completedAt` conforme o novo status.
 */
export function applyMove(
  tasks: readonly Task[],
  id: number,
  target: MoveTarget,
  now: Date = new Date(),
): Task[] {
  const moving = tasks.find((task) => task.id === id);
  if (!moving) return [...tasks];

  const columns = groupByStatus(tasks.filter((task) => task.id !== id));
  const column = columns[target.status];
  const beforeIndex =
    target.beforeId === null ? -1 : column.findIndex((task) => task.id === target.beforeId);
  const insertAt = beforeIndex === -1 ? column.length : beforeIndex;

  const completedAt = target.status === "done" ? (moving.completedAt ?? now.toISOString()) : null;
  column.splice(insertAt, 0, { ...moving, status: target.status, completedAt });

  return TASK_STATUSES.flatMap((status) =>
    columns[status].map((task, index) => ({ ...task, position: index + 1 })),
  );
}
