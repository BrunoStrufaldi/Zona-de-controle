import { type MouseEvent, useEffect, useRef, useState } from "react";

import { EventChip, TaskChip } from "@/features/productivity/calendar/components/agenda-chips";
import { eventBlockClass } from "@/features/productivity/calendar/components/event-styles";
import {
  type DayItems,
  initialScrollHour,
  layoutTimed,
  MINUTES_PER_DAY,
  occurrenceKey,
  timeOf,
  timeRangeLabel,
} from "@/features/productivity/calendar/domain/agenda";
import { type EventOccurrence } from "@/features/productivity/calendar/types";
import { cn } from "@/lib/cn";
import { dayOfMonth, weekdayOf } from "@/lib/dates";
import { formatDate, formatFullDate } from "@/lib/format";
import { weekdayLong, weekdayShort } from "@/lib/weekdays";
import { type IsoDate } from "@/types/common";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
/** Blocos menores que isto mostram só o título. */
const MIN_MINUTES_FOR_TIME = 45;

interface TimeGridViewProps {
  days: readonly IsoDate[];
  today: IsoDate;
  byDay: ReadonlyMap<IsoDate, DayItems>;
  /** Na visão semanal, o cabeçalho do dia abre a visão diária. */
  onOpenDay?: (date: IsoDate) => void;
  onCreate: (date: IsoDate, hour: number) => void;
  onOpen: (occurrence: EventOccurrence) => void;
}

function percent(minutes: number): string {
  return `${(minutes / MINUTES_PER_DAY) * 100}%`;
}

/** Minutos desde a meia-noite, atualizados a cada minuto (linha do "agora"). */
function useNowMinutes(): number {
  const read = () => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  };
  const [minutes, setMinutes] = useState(read);
  useEffect(() => {
    const timer = setInterval(() => {
      setMinutes(read());
    }, 60_000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return minutes;
}

/** Visões semanal e diária: faixa de dia inteiro + grade de 24 horas. */
export function TimeGridView({
  days,
  today,
  byDay,
  onOpenDay,
  onCreate,
  onOpen,
}: TimeGridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nowMinutes = useNowMinutes();
  const columns = { gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` };

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const hour = initialScrollHour(days, byDay, today, nowMinutes);
    element.scrollTop = Math.max((element.scrollHeight / 24) * hour - 8, 0);
    // Só ao abrir a grade: depois, a rolagem é do usuário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createAt = (date: IsoDate) => (event: MouseEvent<HTMLDivElement>) => {
    // Só cliques no fundo da coluna (não em eventos).
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
    onCreate(date, Math.min(Math.max(Math.floor(ratio * 24), 0), 23));
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Cabeçalho dos dias */}
      <div
        className="grid [scrollbar-gutter:stable] overflow-hidden border-b border-border bg-raised/40"
        style={columns}
      >
        <div aria-hidden="true" />
        {days.map((date) => {
          const isToday = date === today;
          const label = (
            <>
              <span className="text-xs text-muted-foreground capitalize">
                {weekdayShort(weekdayOf(date))}
              </span>
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full font-mono text-sm tabular",
                  isToday && "bg-primary font-semibold text-primary-foreground",
                )}
              >
                {dayOfMonth(date)}
              </span>
            </>
          );
          return onOpenDay ? (
            <button
              key={date}
              type="button"
              aria-label={`Abrir ${weekdayLong(weekdayOf(date))}, ${formatDate(date)}`}
              aria-current={isToday ? "date" : undefined}
              onClick={() => {
                onOpenDay(date);
              }}
              className="flex cursor-pointer flex-col items-center gap-0.5 border-l border-border py-1.5 transition-colors hover:bg-raised focus-visible:shadow-glow-sm focus-visible:outline-none"
            >
              {label}
            </button>
          ) : (
            <div
              key={date}
              className="flex flex-col items-center gap-0.5 border-l border-border py-1.5"
            >
              {label}
            </div>
          );
        })}
      </div>

      {/* Faixa de dia inteiro, eventos de vários dias e tarefas */}
      <div
        className="grid [scrollbar-gutter:stable] overflow-hidden border-b border-border"
        style={columns}
      >
        <div className="px-1 py-1.5 text-right text-[0.6875rem] leading-tight text-muted-foreground">
          Dia inteiro
        </div>
        {days.map((date) => {
          const items = byDay.get(date);
          return (
            <ul
              key={date}
              aria-label={`Dia inteiro e tarefas em ${formatDate(date)}`}
              className="grid min-h-8 content-start gap-0.5 border-l border-border p-1"
            >
              {items?.allDay.map((occurrence) => (
                <li key={occurrenceKey(occurrence)}>
                  <EventChip occurrence={occurrence} onOpen={onOpen} />
                </li>
              ))}
              {items?.tasks.map((task) => (
                <li key={`task-${task.id}`}>
                  <TaskChip task={task} />
                </li>
              ))}
            </ul>
          );
        })}
      </div>

      {/* Grade de horários */}
      <div ref={scrollRef} className="max-h-[32rem] [scrollbar-gutter:stable] overflow-y-auto">
        <div className="grid" style={columns}>
          <div aria-hidden="true">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="relative h-12 pr-1.5 text-right font-mono text-[0.6875rem] text-muted-foreground tabular"
              >
                {hour > 0 && <span className="relative -top-2">{timeOf(hour * 60)}</span>}
              </div>
            ))}
          </div>
          {days.map((date) => {
            const blocks = layoutTimed(byDay.get(date)?.timed ?? []);
            return (
              <div
                key={date}
                role="group"
                aria-label={`Horários de ${formatFullDate(date)}`}
                className="relative cursor-cell border-l border-border"
                onClick={createAt(date)}
              >
                <div aria-hidden="true" className="pointer-events-none">
                  {HOURS.map((hour) => (
                    <div key={hour} className="h-12 border-t border-border/60 first:border-t-0" />
                  ))}
                </div>
                {blocks.map(({ occurrence, start, end, column, columns: total }) => (
                  <button
                    key={occurrenceKey(occurrence)}
                    type="button"
                    aria-label={`${occurrence.title}, ${timeRangeLabel(occurrence)}`}
                    title={`${occurrence.title} · ${timeRangeLabel(occurrence)}`}
                    onClick={() => {
                      onOpen(occurrence);
                    }}
                    style={{
                      top: percent(start),
                      height: percent(end - start),
                      left: `calc(${(column / total) * 100}% + 2px)`,
                      width: `calc(${100 / total}% - 4px)`,
                    }}
                    className={cn(
                      "absolute flex cursor-pointer flex-col overflow-hidden rounded-md border-l-2 px-1.5 py-0.5 text-left text-xs text-foreground transition-[filter] hover:brightness-125 focus-visible:z-10 focus-visible:shadow-glow-sm focus-visible:outline-none",
                      eventBlockClass[occurrence.color],
                    )}
                  >
                    <span className="truncate font-medium">{occurrence.title}</span>
                    {end - start >= MIN_MINUTES_FOR_TIME && (
                      <span className="truncate font-mono text-[0.6875rem] text-muted-foreground tabular">
                        {timeRangeLabel(occurrence)}
                      </span>
                    )}
                  </button>
                ))}
                {date === today && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-primary"
                    style={{ top: percent(nowMinutes) }}
                  >
                    <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-primary" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
