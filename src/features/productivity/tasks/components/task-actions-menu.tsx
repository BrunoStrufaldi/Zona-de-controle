import { Archive, ArrowRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { statusLabels } from "@/features/productivity/tasks/domain/labels";
import { TASK_STATUSES, type Task, type TaskStatus } from "@/features/productivity/tasks/types";

interface TaskActionsMenuProps {
  task: Task;
  onEdit: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
  onArchive: (task: Task) => void;
  onDelete: (task: Task) => void;
}

/** Ações de uma tarefa. "Mover para" é a alternativa acessível ao arrastar. */
export function TaskActionsMenu({
  task,
  onEdit,
  onMove,
  onArchive,
  onDelete,
}: TaskActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Ações da tarefa “${task.title}”`}
          className="shrink-0"
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          onSelect={() => {
            onEdit(task);
          }}
        >
          <Pencil aria-hidden="true" />
          Editar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Mover para</DropdownMenuLabel>
        {TASK_STATUSES.filter((status) => status !== task.status).map((status) => (
          <DropdownMenuItem
            key={status}
            onSelect={() => {
              onMove(task, status);
            }}
          >
            <ArrowRight aria-hidden="true" />
            {statusLabels[status]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            onArchive(task);
          }}
        >
          <Archive aria-hidden="true" />
          Arquivar
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-danger focus:text-danger [&_svg]:text-danger"
          onSelect={() => {
            onDelete(task);
          }}
        >
          <Trash2 aria-hidden="true" />
          Excluir…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
