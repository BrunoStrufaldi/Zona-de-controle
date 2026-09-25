import { Checkbox } from "@/components/ui/checkbox";
import { TaskActionsMenu } from "@/features/productivity/tasks/components/task-actions-menu";
import { TaskMeta } from "@/features/productivity/tasks/components/task-meta";
import { type CategoriesById } from "@/features/productivity/tasks/domain/categories";
import { type Task, type TaskStatus } from "@/features/productivity/tasks/types";
import { cn } from "@/lib/cn";
import { type IsoDate } from "@/types/common";

export interface TaskItemHandlers {
  onToggleDone: (task: Task) => void;
  onEdit: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
  onArchive: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggleChecklistItem: (itemId: number, done: boolean) => void;
}

interface TaskListProps extends TaskItemHandlers {
  /** Já filtradas e ordenadas. */
  tasks: readonly Task[];
  today: IsoDate;
  categories: CategoriesById;
}

export function TaskList({ tasks, today, categories, ...handlers }: TaskListProps) {
  return (
    <ul className="grid gap-2" aria-label="Lista de tarefas">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} today={today} categories={categories} {...handlers} />
      ))}
    </ul>
  );
}

interface TaskRowProps extends TaskItemHandlers {
  task: Task;
  today: IsoDate;
  categories: CategoriesById;
}

function TaskRow({
  task,
  today,
  categories,
  onToggleDone,
  onEdit,
  onMove,
  onArchive,
  onDelete,
  onToggleChecklistItem,
}: TaskRowProps) {
  const done = task.status === "done";

  return (
    <li
      className={cn(
        "flex animate-fade-in items-start gap-3 rounded-lg border border-border bg-card px-4 py-3",
        "transition-[border-color,opacity] duration-150 hover:border-border-strong",
        done && "opacity-70",
      )}
    >
      <Checkbox
        checked={done}
        onCheckedChange={() => {
          onToggleDone(task);
        }}
        aria-label={done ? `Reabrir “${task.title}”` : `Concluir “${task.title}”`}
        className="mt-0.5"
      />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <button
          type="button"
          onClick={() => {
            onEdit(task);
          }}
          className={cn(
            "cursor-pointer truncate text-left text-sm font-medium transition-colors hover:text-primary",
            done && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </button>
        {task.description !== "" && (
          <p className="line-clamp-1 text-xs text-muted-foreground">{task.description}</p>
        )}
        <TaskMeta
          task={task}
          today={today}
          categories={categories}
          onToggleChecklistItem={onToggleChecklistItem}
          showStatus
        />
      </div>
      <TaskActionsMenu
        task={task}
        onEdit={onEdit}
        onMove={onMove}
        onArchive={onArchive}
        onDelete={onDelete}
      />
    </li>
  );
}
