import { Archive, KanbanSquare, List, ListChecks, Plus, SearchX } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArchivedTaskList } from "@/features/productivity/tasks/components/archived-task-list";
import { KanbanBoard } from "@/features/productivity/tasks/components/kanban-board";
import { TaskFiltersBar } from "@/features/productivity/tasks/components/task-filters-bar";
import {
  TaskList,
  type TaskItemHandlers,
} from "@/features/productivity/tasks/components/task-list";
import { indexCategories } from "@/features/productivity/tasks/domain/categories";
import {
  DEFAULT_TASK_FILTERS,
  filterTasks,
  groupByStatus,
  sortForList,
  type TaskFilters,
} from "@/features/productivity/tasks/domain/filters";
import { type MoveTarget } from "@/features/productivity/tasks/domain/ordering";
import { summarizeToday } from "@/features/productivity/tasks/domain/summary";
import { type TasksData } from "@/features/productivity/tasks/hooks/use-tasks";
import { type Task, type TaskStatus } from "@/features/productivity/tasks/types";
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
  onReorder: (task: Task, target: MoveTarget) => void;
  onArchiveCompleted: () => void;
  onRestore: (task: Task) => void;
}

export function TasksView({
  data,
  view,
  onViewChange,
  filters,
  onFiltersChange,
  today,
  onCreate,
  onReorder,
  onArchiveCompleted,
  onRestore,
  ...handlers
}: TasksViewProps) {
  if (data.tasks.length === 0 && data.archived.length === 0) {
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

  const categories = indexCategories(data.categories);
  const visible = sortForList(filterTasks(data.tasks, filters));
  const archived = filterTasks(data.archived, filters, { ignoreStatus: true });
  const summary = summarizeToday(data.tasks);
  const openCount = data.tasks.filter((task) => task.status !== "done").length;
  const doneCount = data.tasks.length - openCount;
  const clearFilters = (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        onFiltersChange(DEFAULT_TASK_FILTERS);
      }}
    >
      Limpar filtros
    </Button>
  );

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
          <TabsTrigger value="archived">
            <Archive aria-hidden="true" />
            Arquivadas{" "}
            <span className="font-mono text-xs text-muted-foreground tabular">
              {data.archived.length}
            </span>
          </TabsTrigger>
        </TabsList>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            <Stat value={openCount} label="em aberto" />
            {" · "}
            <Stat
              value={summary.overdue}
              label={summary.overdue === 1 ? "atrasada" : "atrasadas"}
            />
            {" · "}
            <Stat value={summary.completedToday} label="concluídas hoje" />
          </p>
          {view !== "archived" && doneCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onArchiveCompleted}>
              <Archive aria-hidden="true" />
              Arquivar concluídas ({doneCount})
            </Button>
          )}
        </div>
      </div>

      <TabsContent value="list" className="grid gap-4">
        <TaskFiltersBar
          filters={filters}
          onChange={onFiltersChange}
          tags={data.tags}
          categories={data.categories}
        />
        {visible.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="Nenhuma tarefa encontrada"
            description="Ajuste a busca ou os filtros."
            action={clearFilters}
          />
        ) : (
          <TaskList tasks={visible} today={today} categories={categories} {...handlers} />
        )}
      </TabsContent>

      <TabsContent value="kanban" className="grid gap-4">
        <TaskFiltersBar
          filters={filters}
          onChange={onFiltersChange}
          tags={data.tags}
          categories={data.categories}
          showStatus={false}
        />
        <div className="@container">
          <KanbanBoard
            columns={groupByStatus(filterTasks(data.tasks, filters, { ignoreStatus: true }))}
            today={today}
            categories={categories}
            onReorder={onReorder}
            onCreate={onCreate}
            onEdit={handlers.onEdit}
            onMove={handlers.onMove}
            onArchive={handlers.onArchive}
            onDelete={handlers.onDelete}
            onToggleChecklistItem={handlers.onToggleChecklistItem}
          />
        </div>
      </TabsContent>

      <TabsContent value="archived" className="grid gap-4">
        {data.archived.length === 0 ? (
          <EmptyState
            icon={Archive}
            title="Nenhuma tarefa arquivada"
            description="Arquive tarefas pelo menu de ações ou use “Arquivar concluídas”. Elas saem da lista e do Kanban, mas podem ser restauradas."
          />
        ) : (
          <>
            <TaskFiltersBar
              filters={filters}
              onChange={onFiltersChange}
              tags={data.tags}
              categories={data.categories}
              showStatus={false}
            />
            {archived.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="Nenhuma tarefa arquivada encontrada"
                description="Ajuste a busca ou os filtros."
                action={clearFilters}
              />
            ) : (
              <ArchivedTaskList
                tasks={archived}
                today={today}
                categories={categories}
                onRestore={onRestore}
                onDelete={handlers.onDelete}
              />
            )}
          </>
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
