import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { type ComponentProps } from "react";

import { TaskActionsMenu } from "@/features/productivity/tasks/components/task-actions-menu";
import {
  DueBadge,
  PriorityBadge,
  TagList,
} from "@/features/productivity/tasks/components/task-badges";
import { type TaskItemHandlers } from "@/features/productivity/tasks/components/task-list";
import { type Task } from "@/features/productivity/tasks/types";
import { cn } from "@/lib/cn";
import { type IsoDate } from "@/types/common";

interface TaskCardProps extends Omit<TaskItemHandlers, "onToggleDone"> {
  task: Task;
  today: IsoDate;
  /** Props da alça de arrastar (vindas do `useSortable`). */
  handleProps?: ComponentProps<"button">;
  /** Card flutuante exibido durante o arraste. */
  overlay?: boolean;
  dragging?: boolean;
}

export function TaskCard({
  task,
  today,
  handleProps,
  overlay = false,
  dragging = false,
  onEdit,
  onMove,
  onDelete,
}: TaskCardProps) {
  const done = task.status === "done";

  return (
    <div
      className={cn(
        "group flex gap-2 rounded-lg border border-border bg-card p-3 shadow-card",
        "transition-[border-color,box-shadow,opacity] duration-150 hover:border-border-strong",
        dragging && "opacity-40",
        overlay && "cursor-grabbing border-primary/50 shadow-glow",
      )}
    >
      <button
        type="button"
        className="-ml-1 flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-subtle-foreground transition-colors hover:text-foreground focus-visible:text-foreground active:cursor-grabbing"
        aria-label={`Arrastar “${task.title}”`}
        {...handleProps}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>

      <div className="grid min-w-0 flex-1 gap-2">
        <div className="flex items-start gap-1">
          <button
            type="button"
            onClick={() => {
              onEdit(task);
            }}
            className={cn(
              "min-w-0 flex-1 cursor-pointer text-left text-sm font-medium break-words transition-colors hover:text-primary",
              done && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </button>
          {!overlay && (
            <TaskActionsMenu task={task} onEdit={onEdit} onMove={onMove} onDelete={onDelete} />
          )}
        </div>
        {task.description !== "" && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <PriorityBadge priority={task.priority} />
          <DueBadge task={task} today={today} />
          <TagList tags={task.tags} />
        </div>
      </div>
    </div>
  );
}

type SortableTaskCardProps = Omit<TaskCardProps, "handleProps" | "overlay" | "dragging">;

/** Card ordenável: a alça de arrastar recebe os eventos do dnd-kit. */
export function SortableTaskCard(props: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.task.id, data: { type: "task" } });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className="list-none"
    >
      <TaskCard
        {...props}
        dragging={isDragging}
        handleProps={{ ref: setActivatorNodeRef, ...attributes, ...listeners }}
      />
    </li>
  );
}
