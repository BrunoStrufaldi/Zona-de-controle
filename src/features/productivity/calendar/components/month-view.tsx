import { Plus } from "lucide-react";

import { EventChip, TaskChip } from "@/features/productivity/calendar/components/agenda-chips";
import { type DayItems, occurrenceKey } from "@/features/productivity/calendar/domain/agenda";
import { isSameMonth } from "@/features/productivity/calendar/domain/range";
import { type EventOccurrence } from "@/features/productivity/calendar/types";
import { cn } from "@/lib/cn";
import { dayOfMonth, weekdayOf } from "@/lib/dates";
import { formatDate, formatFullDate } from "@/lib/format";
import { WEEKDAYS, weekdayLong, weekdayShort } from "@/lib/weekdays";
import { type IsoDate } from "@/types/common";

/** Itens visíveis por dia antes do "+N mais". */
const MAX_VISIBLE = 3;

interface MonthViewProps {
  days: readonly IsoDate[];
  anchor: IsoDate;
  today: IsoDate;
  byDay: ReadonlyMap<IsoDate, DayItems>;
  onOpenDay: (date: IsoDate) => void;
  onCreate: (date: IsoDate) => void;
  onOpen: (occurrence: EventOccurrence) => void;
}

export function MonthView({
  days,
  anchor,
  today,
  byDay,
  onOpenDay,
  onCreate,
  onOpen,
}: MonthViewProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border bg-raised/40" aria-hidden="true">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground capitalize"
          >
            {weekdayShort(day)}
          </div>
        ))}
      </div>
      <ol className="grid grid-cols-7" aria-label="Dias do mês">
        {days.map((date) => {
          const items = byDay.get(date) ?? { allDay: [], timed: [], tasks: [] };
          const events = [...items.allDay, ...items.timed];
          const total = events.length + items.tasks.length;
          const visibleEvents = events.slice(0, MAX_VISIBLE);
          const visibleTasks = items.tasks.slice(0, MAX_VISIBLE - visibleEvents.length);
          const hidden = total - visibleEvents.length - visibleTasks.length;
          const isToday = date === today;
          const outside = !isSameMonth(date, anchor);

          return (
            <li
              key={date}
              aria-label={formatFullDate(date)}
              className={cn(
                "group relative flex min-h-28 min-w-0 flex-col gap-0.5 border-r border-b border-border p-1 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0",
                outside && "bg-background/40",
              )}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    onOpenDay(date);
                  }}
                  aria-label={`Abrir ${weekdayLong(weekdayOf(date))}, ${formatDate(date)}`}
                  aria-current={isToday ? "date" : undefined}
                  className={cn(
                    "flex size-6 cursor-pointer items-center justify-center rounded-full font-mono text-xs tabular transition-colors hover:bg-raised focus-visible:shadow-glow-sm focus-visible:outline-none",
                    outside ? "text-subtle-foreground" : "text-foreground",
                    isToday && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                  )}
                >
                  {dayOfMonth(date)}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCreate(date);
                  }}
                  aria-label={`Novo evento em ${formatDate(date)}`}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-raised hover:text-foreground focus-visible:opacity-100 focus-visible:shadow-glow-sm focus-visible:outline-none"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                </button>
              </div>
              {visibleEvents.map((occurrence) => (
                <EventChip
                  key={occurrenceKey(occurrence)}
                  occurrence={occurrence}
                  onOpen={onOpen}
                />
              ))}
              {visibleTasks.map((task) => (
                <TaskChip key={`task-${task.id}`} task={task} />
              ))}
              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenDay(date);
                  }}
                  className="cursor-pointer self-start rounded-sm px-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:shadow-glow-sm focus-visible:outline-none"
                >
                  +{hidden} {hidden === 1 ? "item" : "itens"}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
