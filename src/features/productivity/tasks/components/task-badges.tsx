import { CalendarClock, ChevronDown, Flag, ListChecks, Repeat } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  categoryBadgeClass,
  categoryDotClass,
  dueBadgeVariant,
  priorityBadgeVariant,
} from "@/features/productivity/tasks/components/task-styles";
import { checklistProgress } from "@/features/productivity/tasks/domain/checklist";
import { describeDue, getDueState } from "@/features/productivity/tasks/domain/due";
import { priorityLabels } from "@/features/productivity/tasks/domain/labels";
import { describeRecurrence } from "@/features/productivity/tasks/domain/recurrence";
import {
  type ChecklistItem,
  type Task,
  type TaskCategory,
  type TaskPriority,
  type TaskRecurrence,
} from "@/features/productivity/tasks/types";
import { cn } from "@/lib/cn";
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

export function CategoryBadge({ category }: { category: Pick<TaskCategory, "name" | "color"> }) {
  return (
    <Badge
      variant="outline"
      className={categoryBadgeClass[category.color]}
      aria-label={`Categoria ${category.name}`}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", categoryDotClass[category.color])}
      />
      {category.name}
    </Badge>
  );
}

export function RecurrenceBadge({ recurrence }: { recurrence: TaskRecurrence }) {
  const label = describeRecurrence(recurrence);
  return (
    <Badge variant="outline" aria-label={`Repete: ${label}`} title={`Repete: ${label}`}>
      <Repeat aria-hidden="true" />
      {label}
    </Badge>
  );
}

interface ChecklistToggleProps {
  items: readonly ChecklistItem[];
  expanded: boolean;
  controls: string;
  onToggle: () => void;
}

/** Progresso da checklist ("2/5"); clicar mostra ou esconde os itens. */
export function ChecklistToggle({ items, expanded, controls, onToggle }: ChecklistToggleProps) {
  const { done, total } = checklistProgress(items);
  const complete = done === total;
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={`Checklist: ${done} de ${total} concluídos`}
      onClick={onToggle}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4 font-medium transition-colors [&_svg]:size-3",
        complete
          ? "border-success/30 bg-success/10 text-success"
          : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      <ListChecks aria-hidden="true" />
      <span className="font-mono tabular">
        {done}/{total}
      </span>
      <ChevronDown
        aria-hidden="true"
        className={cn("transition-transform duration-150", expanded && "rotate-180")}
      />
    </button>
  );
}
