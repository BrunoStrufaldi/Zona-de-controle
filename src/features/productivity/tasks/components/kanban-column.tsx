import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SortableTaskCard } from "@/features/productivity/tasks/components/task-card";
import { type TaskItemHandlers } from "@/features/productivity/tasks/components/task-list";
import { type CategoriesById } from "@/features/productivity/tasks/domain/categories";
import { statusLabels } from "@/features/productivity/tasks/domain/labels";
import { type Task, type TaskStatus } from "@/features/productivity/tasks/types";
import { cn } from "@/lib/cn";
import { type IsoDate } from "@/types/common";

const statusDotClass: Record<TaskStatus, string> = {
  todo: "bg-muted-foreground",
  in_progress: "bg-primary shadow-glow-sm",
  done: "bg-success",
};

/** Id do droppable de uma coluna (tarefas usam o id numérico). */
const columnDropId = (status: TaskStatus) => `column:${status}`;

interface KanbanColumnProps extends Omit<TaskItemHandlers, "onToggleDone"> {
  status: TaskStatus;
  tasks: readonly Task[];
  today: IsoDate;
  categories: CategoriesById;
  onCreate: (status: TaskStatus) => void;
}

export function KanbanColumn({
  status,
  tasks,
  today,
  categories,
  onCreate,
  ...handlers
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(status),
    data: { type: "column", status },
  });
  const label = statusLabels[status];

  return (
    <section
      aria-label={`Coluna ${label}`}
      className={cn(
        "flex min-h-80 flex-col gap-3 rounded-xl border border-border bg-card/40 p-3",
        "transition-[border-color,background-color] duration-150",
        isOver && "border-primary/50 bg-primary/5",
      )}
    >
      <header className="flex items-center gap-2 px-1">
        <span aria-hidden="true" className={cn("size-2 rounded-full", statusDotClass[status])} />
        <h2 className="text-sm font-medium">{label}</h2>
        <span className="rounded-full bg-raised px-2 py-0.5 font-mono text-xs text-muted-foreground tabular">
          {tasks.length}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label={`Nova tarefa em “${label}”`}
          onClick={() => {
            onCreate(status);
          }}
        >
          <Plus aria-hidden="true" />
        </Button>
      </header>

      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className="flex flex-1 flex-col gap-2"
          aria-label={`Tarefas em ${label}`}
        >
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              today={today}
              categories={categories}
              {...handlers}
            />
          ))}
          {tasks.length === 0 && (
            <li className="flex flex-1 list-none items-center justify-center rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-subtle-foreground">
              Arraste tarefas para cá
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  );
}
