import { ArrowRight, CalendarClock, ListChecks, Plus } from "lucide-react";
import { Link } from "react-router";

import { newTaskHref, paths } from "@/app/router/paths";
import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { priorityBadgeVariant } from "@/features/productivity/tasks/components/task-styles";
import { priorityLabels } from "@/features/productivity/tasks/domain/labels";
import { summarizeToday } from "@/features/productivity/tasks/domain/summary";
import { type Task, type TasksOverview } from "@/features/productivity/tasks/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { formatDate } from "@/lib/format";
import { safeRatio } from "@/lib/math";

interface TasksSummaryWidgetProps {
  tasks: AsyncResource<Task[]>;
}

/** Resumo do dia no dashboard, com dados reais do módulo de Tarefas. */
export function TasksSummaryWidget({ tasks }: TasksSummaryWidgetProps) {
  return (
    <WidgetCard
      title="Tarefas de hoje"
      icon={ListChecks}
      headerExtra={
        <Button asChild variant="ghost" size="sm" className="h-7 px-2">
          <Link to={paths.productivity.tasks}>
            Ver todas
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <ResourceView resource={tasks} className="py-6">
        {(data) =>
          data.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Nenhuma tarefa ainda"
              className="border-0 py-6"
              action={
                <Button asChild size="sm" variant="secondary">
                  <Link to={newTaskHref}>
                    <Plus aria-hidden="true" />
                    Criar tarefa
                  </Link>
                </Button>
              }
            />
          ) : (
            <TodaySummary summary={summarizeToday(data)} />
          )
        }
      </ResourceView>
    </WidgetCard>
  );
}

function TodaySummary({ summary }: { summary: TasksOverview }) {
  const ratio = safeRatio(summary.completedToday, summary.plannedToday);

  return (
    <>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-3xl font-semibold tabular">{summary.completedToday}</span>
        <span className="text-sm text-muted-foreground">
          de {summary.plannedToday} {summary.plannedToday === 1 ? "concluída" : "concluídas"}
        </span>
        {summary.overdue > 0 && (
          <Badge variant="danger" className="ml-auto">
            {summary.overdue} {summary.overdue === 1 ? "atrasada" : "atrasadas"}
          </Badge>
        )}
      </div>
      <Progress value={ratio * 100} className="mt-3" aria-label="Progresso das tarefas de hoje" />

      {summary.upcoming.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nenhuma tarefa em aberto com vencimento.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2" aria-label="Próximos vencimentos">
          {summary.upcoming.map((task) => (
            <li key={task.id} className="flex min-w-0 items-center gap-3 text-sm">
              <CalendarClock
                className="size-4 shrink-0 text-subtle-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">{task.title}</span>
              <Badge variant={priorityBadgeVariant[task.priority]}>
                {priorityLabels[task.priority]}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground tabular">
                {formatDate(task.dueDate)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
