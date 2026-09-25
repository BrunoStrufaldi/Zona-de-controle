import {
  type Announcements,
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  type ScreenReaderInstructions,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useState } from "react";

import { KanbanColumn } from "@/features/productivity/tasks/components/kanban-column";
import { kanbanKeyboardCoordinates } from "@/features/productivity/tasks/components/kanban-keyboard";
import { TaskCard } from "@/features/productivity/tasks/components/task-card";
import { type TaskItemHandlers } from "@/features/productivity/tasks/components/task-list";
import { type CategoriesById } from "@/features/productivity/tasks/domain/categories";
import { type TaskColumns } from "@/features/productivity/tasks/domain/filters";
import { statusLabels } from "@/features/productivity/tasks/domain/labels";
import {
  type DropLocation,
  type MoveTarget,
  resolveDrop,
} from "@/features/productivity/tasks/domain/ordering";
import { TASK_STATUSES, type Task, type TaskStatus } from "@/features/productivity/tasks/types";
import { type IsoDate } from "@/types/common";

interface KanbanBoardProps extends Omit<TaskItemHandlers, "onToggleDone"> {
  columns: TaskColumns;
  today: IsoDate;
  categories: CategoriesById;
  onReorder: (task: Task, target: MoveTarget) => void;
  onCreate: (status: TaskStatus) => void;
}

type DropData = { type: "task" } | { type: "column"; status: TaskStatus };

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Para mover uma tarefa, pressione espaço ou Enter. Use as setas para cima e para baixo " +
    "para mudar a posição na coluna e as setas para os lados para trocar de coluna. " +
    "Pressione espaço ou Enter para soltar, ou Esc para cancelar. " +
    "Também é possível usar o menu de ações → Mover para.",
};

function toDropLocation(overId: string | number, data: DropData | undefined): DropLocation | null {
  if (data?.type === "column") return { type: "column", status: data.status };
  if (data?.type === "task") return { type: "task", id: Number(overId) };
  return null;
}

export function KanbanBoard({
  columns,
  today,
  categories,
  onReorder,
  onCreate,
  ...handlers
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const allTasks = TASK_STATUSES.flatMap((status) => columns[status]);
  const findTask = (id: string | number) => allTasks.find((task) => task.id === Number(id));
  const activeTask = activeId === null ? undefined : findTask(activeId);

  const sensors = useSensors(
    // Distância mínima: permite clicar no card sem iniciar um arraste.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: kanbanKeyboardCoordinates }),
  );

  const describeOver = (overId: string | number, data: DropData | undefined) => {
    if (data?.type === "column") return `na coluna ${statusLabels[data.status]}`;
    const task = findTask(overId);
    return task ? `sobre “${task.title}” em ${statusLabels[task.status]}` : "fora de uma coluna";
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Tarefa “${findTask(active.id)?.title ?? ""}” selecionada.`,
    onDragOver: ({ over }) =>
      over ? `Posicionada ${describeOver(over.id, over.data.current as DropData)}.` : undefined,
    onDragEnd: ({ over }) =>
      over
        ? `Tarefa solta ${describeOver(over.id, over.data.current as DropData)}.`
        : "Movimento cancelado.",
    onDragCancel: () => "Movimento cancelado.",
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(Number(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const location = toDropLocation(over.id, over.data.current as DropData | undefined);
    const task = findTask(active.id);
    if (!location || !task) return;
    const target = resolveDrop(columns, task.id, location);
    if (target) onReorder(task, target);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{ announcements, screenReaderInstructions }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null);
      }}
    >
      <div className="grid gap-4 @3xl:grid-cols-3">
        {TASK_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={columns[status]}
            today={today}
            categories={categories}
            onCreate={onCreate}
            {...handlers}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
        {activeTask && (
          <TaskCard task={activeTask} today={today} categories={categories} overlay {...handlers} />
        )}
      </DragOverlay>
    </DndContext>
  );
}
