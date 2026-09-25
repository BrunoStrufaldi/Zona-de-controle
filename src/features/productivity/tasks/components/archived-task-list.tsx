import { ArchiveRestore, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskMeta } from "@/features/productivity/tasks/components/task-meta";
import { statusBadgeVariant } from "@/features/productivity/tasks/components/task-styles";
import { type CategoriesById } from "@/features/productivity/tasks/domain/categories";
import { statusLabels } from "@/features/productivity/tasks/domain/labels";
import { type Task } from "@/features/productivity/tasks/types";
import { formatDate } from "@/lib/format";
import { type IsoDate } from "@/types/common";

interface ArchivedTaskListProps {
  tasks: readonly Task[];
  today: IsoDate;
  categories: CategoriesById;
  onRestore: (task: Task) => void;
  onDelete: (task: Task) => void;
}

/** Tarefas arquivadas: somente leitura, com restaurar e excluir. */
export function ArchivedTaskList({
  tasks,
  today,
  categories,
  onRestore,
  onDelete,
}: ArchivedTaskListProps) {
  return (
    <ul className="grid gap-2" aria-label="Tarefas arquivadas">
      {tasks.map((task) => (
        <li
          key={task.id}
          className="flex animate-fade-in flex-wrap items-start gap-3 rounded-lg border border-border bg-card/60 px-4 py-3"
        >
          <div className="grid min-w-0 flex-1 basis-64 gap-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-muted-foreground">
                {task.title}
              </span>
              <Badge variant={statusBadgeVariant[task.status]}>{statusLabels[task.status]}</Badge>
            </div>
            <TaskMeta task={task} today={today} categories={categories} />
            {task.archivedAt && (
              <p className="text-xs text-subtle-foreground">
                Arquivada em {formatDate(task.archivedAt)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Restaurar “${task.title}”`}
              onClick={() => {
                onRestore(task);
              }}
            >
              <ArchiveRestore aria-hidden="true" />
              Restaurar
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-danger hover:text-danger"
              aria-label={`Excluir “${task.title}”`}
              onClick={() => {
                onDelete(task);
              }}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
