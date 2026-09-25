import { useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CategoryBadge,
  ChecklistToggle,
  DueBadge,
  PriorityBadge,
  RecurrenceBadge,
  TagList,
} from "@/features/productivity/tasks/components/task-badges";
import { type CategoriesById } from "@/features/productivity/tasks/domain/categories";
import { statusLabels } from "@/features/productivity/tasks/domain/labels";
import { type ChecklistItem, type Task } from "@/features/productivity/tasks/types";
import { cn } from "@/lib/cn";
import { type IsoDate } from "@/types/common";

interface TaskMetaProps {
  task: Task;
  today: IsoDate;
  categories: CategoriesById;
  /** Ausente = checklist somente leitura (ex.: arquivadas, card flutuante). */
  onToggleChecklistItem?: ((itemId: number, done: boolean) => void) | undefined;
  /** Mostra o selo "Fazendo" (na lista; no Kanban a coluna já indica). */
  showStatus?: boolean;
}

/** Selos da tarefa e checklist expansível, comuns à lista e ao Kanban. */
export function TaskMeta({
  task,
  today,
  categories,
  onToggleChecklistItem,
  showStatus = false,
}: TaskMetaProps) {
  const [expanded, setExpanded] = useState(false);
  const checklistId = useId();
  const category = task.categoryId === null ? undefined : categories.get(task.categoryId);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {showStatus && task.status === "in_progress" && (
          <Badge variant="primary">{statusLabels.in_progress}</Badge>
        )}
        {category && <CategoryBadge category={category} />}
        <PriorityBadge priority={task.priority} />
        <DueBadge task={task} today={today} />
        {task.recurrence && <RecurrenceBadge recurrence={task.recurrence} />}
        {task.checklist.length > 0 && (
          <ChecklistToggle
            items={task.checklist}
            expanded={expanded}
            controls={checklistId}
            onToggle={() => {
              setExpanded((value) => !value);
            }}
          />
        )}
        <TagList tags={task.tags} />
      </div>
      {expanded && (
        <ChecklistItems
          id={checklistId}
          title={task.title}
          items={task.checklist}
          onToggle={onToggleChecklistItem}
        />
      )}
    </>
  );
}

interface ChecklistItemsProps {
  id: string;
  title: string;
  items: readonly ChecklistItem[];
  onToggle?: ((itemId: number, done: boolean) => void) | undefined;
}

function ChecklistItems({ id, title, items, onToggle }: ChecklistItemsProps) {
  return (
    <ul
      id={id}
      aria-label={`Checklist de “${title}”`}
      className="grid animate-fade-in gap-1.5 border-l border-border pl-3"
    >
      {items.map((item) => (
        <ChecklistRow key={item.id} item={item} onToggle={onToggle} />
      ))}
    </ul>
  );
}

function ChecklistRow({
  item,
  onToggle,
}: {
  item: ChecklistItem;
  onToggle?: ((itemId: number, done: boolean) => void) | undefined;
}) {
  const checkboxId = useId();
  return (
    <li className="flex items-start gap-2 text-xs">
      <Checkbox
        id={checkboxId}
        checked={item.done}
        disabled={onToggle === undefined}
        onCheckedChange={(checked) => {
          onToggle?.(item.id, checked === true);
        }}
        className="mt-px size-4"
      />
      <label
        htmlFor={checkboxId}
        className={cn(
          "min-w-0 cursor-pointer break-words",
          item.done && "text-muted-foreground line-through",
        )}
      >
        {item.text}
      </label>
    </li>
  );
}
