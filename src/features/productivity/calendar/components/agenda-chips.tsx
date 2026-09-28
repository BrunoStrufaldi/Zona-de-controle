import { CircleCheck, Circle, Repeat } from "lucide-react";
import { Link } from "react-router";

import { taskHref } from "@/app/router/paths";
import { eventChipClass } from "@/features/productivity/calendar/components/event-styles";
import { spansAllDay, timeRangeLabel } from "@/features/productivity/calendar/domain/agenda";
import { type CalendarTask, type EventOccurrence } from "@/features/productivity/calendar/types";
import { cn } from "@/lib/cn";

interface EventChipProps {
  occurrence: EventOccurrence;
  onOpen: (occurrence: EventOccurrence) => void;
  className?: string;
}

/** Evento compacto (visão mensal e faixa de dia inteiro); abre os detalhes. */
export function EventChip({ occurrence, onOpen, className }: EventChipProps) {
  const time = timeRangeLabel(occurrence);
  const showTime = !spansAllDay(occurrence);
  return (
    <button
      type="button"
      aria-label={`${occurrence.title}, ${time}`}
      title={`${occurrence.title} · ${time}`}
      onClick={() => {
        onOpen(occurrence);
      }}
      className={cn(
        "flex w-full min-w-0 cursor-pointer items-center gap-1 rounded-sm border-l-2 px-1.5 py-0.5 text-left text-xs text-foreground transition-colors focus-visible:shadow-glow-sm focus-visible:outline-none",
        eventChipClass[occurrence.color],
        className,
      )}
    >
      {showTime && (
        <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground tabular">
          {occurrence.startTime}
        </span>
      )}
      <span className="min-w-0 truncate">{occurrence.title}</span>
      {occurrence.recurring && (
        <Repeat className="ml-auto size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </button>
  );
}

/** Tarefa com vencimento no dia: link para abri-la na página de Tarefas. */
export function TaskChip({ task, className }: { task: CalendarTask; className?: string }) {
  const done = task.status === "done";
  const Icon = done ? CircleCheck : Circle;
  return (
    <Link
      to={taskHref(task.id)}
      aria-label={`Tarefa: ${task.title}${done ? " (concluída)" : ""}`}
      title={`Tarefa: ${task.title}`}
      className={cn(
        "flex w-full min-w-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-raised hover:text-foreground focus-visible:shadow-glow-sm focus-visible:outline-none",
        className,
      )}
    >
      <Icon className={cn("size-3 shrink-0", done && "text-success")} aria-hidden="true" />
      <span className={cn("min-w-0 truncate", done && "line-through")}>{task.title}</span>
    </Link>
  );
}
