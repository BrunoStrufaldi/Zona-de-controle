import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_TASK_FILTERS,
  hasActiveFilters,
  type PriorityFilter,
  type StatusFilter,
  type TaskFilters,
} from "@/features/productivity/tasks/domain/filters";
import { priorityLabels, statusLabels } from "@/features/productivity/tasks/domain/labels";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/features/productivity/tasks/types";

const ALL_TAGS = "__all__";

interface TaskFiltersBarProps {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  tags: readonly string[];
  /** No Kanban o status é representado pelas colunas. */
  showStatus?: boolean;
}

export function TaskFiltersBar({
  filters,
  onChange,
  tags,
  showStatus = true,
}: TaskFiltersBarProps) {
  const update = (patch: Partial<TaskFilters>) => {
    onChange({ ...filters, ...patch });
  };
  const active = showStatus
    ? hasActiveFilters(filters)
    : hasActiveFilters({ ...filters, status: DEFAULT_TASK_FILTERS.status });

  return (
    <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Filtrar tarefas">
      <div className="relative min-w-52 flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground"
          aria-hidden="true"
        />
        <Input
          value={filters.search}
          onChange={(event) => {
            update({ search: event.target.value });
          }}
          placeholder="Buscar por título, descrição ou tag…"
          aria-label="Buscar tarefas"
          className="pl-9"
        />
      </div>

      {showStatus && (
        <Select
          value={filters.status}
          onValueChange={(value) => {
            update({ status: value as StatusFilter });
          }}
        >
          <SelectTrigger className="w-36" aria-label="Filtrar por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Em aberto</SelectItem>
            {TASK_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {statusLabels[status]}
              </SelectItem>
            ))}
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>
      )}

      <Select
        value={filters.priority}
        onValueChange={(value) => {
          update({ priority: value as PriorityFilter });
        }}
      >
        <SelectTrigger className="w-48" aria-label="Filtrar por prioridade">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Qualquer prioridade</SelectItem>
          {[...TASK_PRIORITIES].reverse().map((priority) => (
            <SelectItem key={priority} value={priority}>
              {priorityLabels[priority]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.tag ?? ALL_TAGS}
        onValueChange={(value) => {
          update({ tag: value === ALL_TAGS ? null : value });
        }}
        disabled={tags.length === 0}
      >
        <SelectTrigger className="w-36" aria-label="Filtrar por tag">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_TAGS}>Todas as tags</SelectItem>
          {tags.map((tag) => (
            <SelectItem key={tag} value={tag}>
              #{tag}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange(
              showStatus
                ? DEFAULT_TASK_FILTERS
                : { ...DEFAULT_TASK_FILTERS, status: filters.status },
            );
          }}
        >
          <X aria-hidden="true" />
          Limpar
        </Button>
      )}
    </div>
  );
}
