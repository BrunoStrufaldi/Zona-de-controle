import { ArrowDown, ArrowUp, ListTree, Search } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type ProcessSortKey,
  processSortLabels,
  selectProcesses,
} from "@/features/system/domain/processes";
import { type ProcessList } from "@/features/system/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { cn } from "@/lib/cn";
import { formatBytes, formatNumber, formatPercent } from "@/lib/format";

interface ProcessesCardProps {
  processes: AsyncResource<ProcessList>;
  className?: string;
}

/** Processos agrupados por executável. Somente leitura: não há como encerrar processos. */
export function ProcessesCard({ processes, className }: ProcessesCardProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<ProcessSortKey>("cpu");

  return (
    <WidgetCard
      title="Processos"
      icon={ListTree}
      className={className}
      headerExtra={
        processes.status === "success" && (
          <span className="text-xs text-muted-foreground tabular">
            {formatNumber(processes.data.totalProcesses)} processos ·{" "}
            {formatNumber(processes.data.groups.length)} programas
          </span>
        )
      }
      contentClassName="gap-3"
    >
      <div className="relative" role="search" aria-label="Buscar processos">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          placeholder="Buscar pelo nome do programa"
          aria-label="Buscar processos"
          className="pl-9"
        />
      </div>

      <ResourceView resource={processes} className="py-6" loadingLabel="Lendo processos…">
        {(data) => {
          const rows = selectProcesses(data.groups, search, sortKey);
          if (rows.length === 0) {
            return (
              <EmptyState
                icon={Search}
                title="Nenhum programa encontrado"
                description="Tente outro nome."
                className="border-0 py-6"
              />
            );
          }
          return (
            <div className="max-h-[28rem] overflow-auto rounded-md border border-border">
              <Table aria-label="Processos por programa">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <SortableHead column="name" current={sortKey} onSort={setSortKey} />
                    <SortableHead
                      column="cpu"
                      current={sortKey}
                      onSort={setSortKey}
                      className="w-28 text-right"
                    />
                    <SortableHead
                      column="memory"
                      current={sortKey}
                      onSort={setSortKey}
                      className="w-32 text-right"
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((group) => (
                    <TableRow key={group.name.toLowerCase()}>
                      <TableCell className="max-w-0 truncate font-medium" title={group.name}>
                        {group.name}
                        {group.instances > 1 && (
                          <span className="ml-2 text-xs font-normal text-subtle-foreground tabular">
                            ×{group.instances}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular">
                        {data.cpuMeasured ? formatPercent(group.cpuPercent / 100, 1) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular">
                        {formatBytes(group.memoryBytes)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          );
        }}
      </ResourceView>
      {processes.status === "success" && !processes.data.cpuMeasured && (
        <p className="text-xs text-subtle-foreground">Medindo o uso de CPU por programa…</p>
      )}
    </WidgetCard>
  );
}

interface SortableHeadProps {
  column: ProcessSortKey;
  current: ProcessSortKey;
  onSort: (column: ProcessSortKey) => void;
  className?: string;
}

/** Números do maior para o menor; nomes de A a Z. */
function SortableHead({ column, current, onSort, className }: SortableHeadProps) {
  const active = column === current;
  const Arrow = column === "name" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (column === "name" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => {
          onSort(column);
        }}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          active && "text-foreground",
        )}
      >
        {processSortLabels[column]}
        <Arrow className={cn("size-3", active ? "opacity-100" : "opacity-0")} aria-hidden="true" />
      </button>
    </TableHead>
  );
}
