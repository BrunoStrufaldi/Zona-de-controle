import { CalendarClock, ListChecks } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import { type BadgeVariantProps } from "@/components/ui/badge-variants";
import { Progress } from "@/components/ui/progress";
import { priorityLabels } from "@/features/productivity/tasks/domain/labels";
import { type TaskPriority, type TasksOverview } from "@/features/productivity/tasks/types";
import { formatDate } from "@/lib/format";
import { safeRatio } from "@/lib/math";

const priorityVariant: Record<TaskPriority, BadgeVariantProps["variant"]> = {
  low: "default",
  medium: "info",
  high: "warning",
  urgent: "danger",
};

interface TasksSummaryWidgetProps {
  data: TasksOverview;
  demo?: boolean;
}

export function TasksSummaryWidget({ data, demo = false }: TasksSummaryWidgetProps) {
  const ratio = safeRatio(data.completedToday, data.plannedToday);

  return (
    <WidgetCard title="Tarefas de hoje" icon={ListChecks} demo={demo}>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-3xl font-semibold tabular">{data.completedToday}</span>
        <span className="text-sm text-muted-foreground">de {data.plannedToday} concluídas</span>
        {data.overdue > 0 && (
          <Badge variant="danger" className="ml-auto">
            {data.overdue} atrasada{data.overdue > 1 ? "s" : ""}
          </Badge>
        )}
      </div>
      <Progress value={ratio * 100} className="mt-3" aria-label="Progresso das tarefas de hoje" />

      <ul className="mt-4 grid gap-2">
        {data.upcoming.map((task) => (
          <li key={task.id} className="flex min-w-0 items-center gap-3 text-sm">
            <CalendarClock className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{task.title}</span>
            <Badge variant={priorityVariant[task.priority]}>{priorityLabels[task.priority]}</Badge>
            <span className="font-mono text-xs text-muted-foreground tabular">
              {formatDate(task.dueDate)}
            </span>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
