import { CalendarClock, Flag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  dueBadgeVariant,
  priorityBadgeVariant,
} from "@/features/productivity/tasks/components/task-styles";
import { describeDue, getDueState } from "@/features/productivity/tasks/domain/due";
import { priorityLabels } from "@/features/productivity/tasks/domain/labels";
import { type Task, type TaskPriority } from "@/features/productivity/tasks/types";
import { formatDate } from "@/lib/format";
import { type IsoDate } from "@/types/common";

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <Badge
      variant={priorityBadgeVariant[priority]}
      aria-label={`Prioridade ${priorityLabels[priority]}`}
    >
      <Flag aria-hidden="true" />
      {priorityLabels[priority]}
    </Badge>
  );
}

interface DueBadgeProps {
  task: Pick<Task, "dueDate" | "status">;
  today: IsoDate;
}

/** Vencimento com destaque: atrasada, hoje e em breve usam texto relativo. */
export function DueBadge({ task, today }: DueBadgeProps) {
  if (task.dueDate === null) return null;
  const state = getDueState(task, today);
  const relative = state === "overdue" || state === "today" || state === "soon";
  const label = relative ? describeDue(task.dueDate, today) : formatDate(task.dueDate);

  return (
    <Badge
      variant={dueBadgeVariant[state]}
      title={`Vence em ${formatDate(task.dueDate)}`}
      aria-label={`Vencimento: ${label} (${formatDate(task.dueDate)})`}
    >
      <CalendarClock aria-hidden="true" />
      {label}
    </Badge>
  );
}

export function TagList({ tags }: { tags: readonly string[] }) {
  return (
    <>
      {tags.map((tag) => (
        <span key={tag} className="text-xs text-muted-foreground">
          #{tag}
        </span>
      ))}
    </>
  );
}
