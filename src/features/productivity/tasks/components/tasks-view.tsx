import { KanbanSquare, List, ListChecks, Plus, SearchX } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskFiltersBar } from "@/features/productivity/tasks/components/task-filters-bar";
import {
  TaskList,
  type TaskItemHandlers,
} from "@/features/productivity/tasks/components/task-list";
import {
  DEFAULT_TASK_FILTERS,
  filterTasks,
  sortForList,
  type TaskFilters,
} from "@/features/productivity/tasks/domain/filters";
import { summarizeToday } from "@/features/productivity/tasks/domain/summary";
import { type TasksData } from "@/features/productivity/tasks/hooks/use-tasks";
import { type TaskStatus } from "@/features/productivity/tasks/types";
import { type TasksView as TasksViewMode } from "@/stores/ui-store";
import { type IsoDate } from "@/types/common";

interface TasksViewProps extends TaskItemHandlers {
  data: TasksData;
  view: TasksViewMode;
  onViewChange: (view: TasksViewMode) => void;
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
  today: IsoDate;
  onCreate: (status?: TaskStatus) => void;
}

export function TasksView({
  data,
  view,
  onViewChange,
  filters,
  onFiltersChange,
  today,
  onCreate,
  ...handlers
}: TasksViewProps) {
  if (data.tasks.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="Nenhuma tarefa ainda"
        description="Crie sua primeira tarefa para começar a organizar o dia."
        action={
          <Button
            onClick={() => {
              onCreate();
            }}
          >
            <Plus aria-hidden="true" />
            Nova tarefa
          </Button>
        }
        className="py-16"
      />
    );
  }

  const visible = sortForList(filterTasks(data.tasks, filters));
  const summary = summarizeToday(data.tasks);
  const openCount = data.tasks.filter((task) => task.status !== "done").length;

  return (
    <Tabs
      value={view}
      onValueChange={(value) => {
        onViewChange(value as TasksViewMode);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="list">
            <List aria-hidden="true" />
            Lista
          </TabsTrigger>
          <TabsTrigger value="kanban">
            <KanbanSquare aria-hidden="true" />
            Kanban
          </TabsTrigger>
        </TabsList>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          <Stat value={openCount} label="em aberto" />
          {" · "}
          <Stat value={summary.overdue} label={summary.overdue === 1 ? "atrasada" : "atrasadas"} />
          {" · "}
          <Stat value={summary.completedToday} label="concluídas hoje" />
        </p>
      </div>

      <TabsContent value="list" className="grid gap-4">
        <TaskFiltersBar filters={filters} onChange={onFiltersChange} tags={data.tags} />
        {visible.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="Nenhuma tarefa encontrada"
            description="Ajuste a busca ou os filtros."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onFiltersChange(DEFAULT_TASK_FILTERS);
                }}
              >
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <TaskList tasks={visible} today={today} {...handlers} />
        )}
      </TabsContent>
    </Tabs>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <span className="font-mono font-medium text-foreground tabular">{value}</span> {label}
    </span>
  );
}
