import { type MouseEvent } from "react";

import {
  allDayBlocksOn,
  blockTimeLabel,
  DISPLAY_WEEKDAYS,
  fromMinutes,
  gridRange,
  MINUTES_PER_HOUR,
  nowAndNext,
  timedBlocksOn,
  toMinutes,
} from "@/features/productivity/weekly-plan/domain/plan";
import { type PlanBlock } from "@/features/productivity/weekly-plan/types";
import { cn } from "@/lib/cn";
import { categoryBadgeClass, categoryBlockClass } from "@/lib/palette";
import { weekdayLong, weekdayShort } from "@/lib/weekdays";

/** Altura de uma hora na grade, em pixels. */
const HOUR_PX = 44;
/** Blocos a partir desta altura mostram o horário; a partir da dobro, a observação. */
const TIME_MIN_PX = 34;
/** Cliques no fundo criam blocos alinhados a este intervalo. */
const SNAP_MINUTES = 30;

const COLUMNS = { gridTemplateColumns: "3.5rem repeat(7, minmax(0, 1fr))" };

interface WeeklyPlanGridProps {
  blocks: readonly PlanBlock[];
  now: Date;
  /** Clique num horário vazio (`startMinutes` nulo = faixa do dia inteiro). */
  onCreate: (weekday: number, startMinutes: number | null) => void;
  onEdit: (block: PlanBlock) => void;
}

/** Semana de segunda a domingo, com os blocos no horário (como uma planilha de horários). */
export function WeeklyPlanGrid({ blocks, now, onCreate, onEdit }: WeeklyPlanGridProps) {
  const range = gridRange(blocks);
  const hours = Array.from(
    { length: (range.end - range.start) / MINUTES_PER_HOUR },
    (_, index) => range.start + index * MINUTES_PER_HOUR,
  );
  const height = hours.length * HOUR_PX;
  const toPx = (minutes: number) => ((minutes - range.start) / MINUTES_PER_HOUR) * HOUR_PX;
  const today = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const current = nowAndNext(blocks, now).current;

  const createAt = (weekday: number) => (event: MouseEvent<HTMLDivElement>) => {
    // Só cliques no fundo da coluna (não em blocos).
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes = range.start + ((event.clientY - rect.top) / HOUR_PX) * MINUTES_PER_HOUR;
    const snapped = Math.floor(minutes / SNAP_MINUTES) * SNAP_MINUTES;
    onCreate(weekday, Math.min(Math.max(snapped, range.start), range.end - SNAP_MINUTES));
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <div className="min-w-[46rem]">
        {/* Cabeçalho dos dias */}
        <div className="grid border-b border-border bg-raised/40" style={COLUMNS}>
          <div aria-hidden="true" />
          {DISPLAY_WEEKDAYS.map((day) => (
            <div
              key={day}
              aria-current={day === today ? "date" : undefined}
              className={cn(
                "border-l border-border py-2 text-center text-xs font-medium capitalize",
                day === today ? "text-primary" : "text-muted-foreground",
              )}
            >
              {weekdayShort(day)}
              {day === today && <span className="sr-only"> (hoje)</span>}
            </div>
          ))}
        </div>

        {/* Anotações do dia inteiro */}
        <div className="grid border-b border-border" style={COLUMNS}>
          <div className="px-1 py-1.5 text-right text-[0.6875rem] leading-tight text-muted-foreground">
            Dia inteiro
          </div>
          {DISPLAY_WEEKDAYS.map((day) => (
            <div
              key={day}
              role="group"
              aria-label={`Dia inteiro: ${weekdayLong(day)}`}
              className="grid min-h-9 cursor-cell content-start gap-1 border-l border-border p-1"
              onClick={(event) => {
                if (event.target === event.currentTarget) onCreate(day, null);
              }}
            >
              {allDayBlocksOn(blocks, day).map((block) => (
                <button
                  key={block.id}
                  type="button"
                  title={block.notes === "" ? block.title : `${block.title}\n${block.notes}`}
                  aria-label={`${block.title}, ${weekdayLong(day)}, dia inteiro`}
                  onClick={() => {
                    onEdit(block);
                  }}
                  className={cn(
                    "cursor-pointer rounded-md border px-1.5 py-1 text-left text-xs leading-snug",
                    categoryBadgeClass[block.color],
                  )}
                >
                  <span className="line-clamp-3 font-medium">{block.title}</span>
                  {block.notes !== "" && (
                    <span className="line-clamp-3 text-[0.6875rem] opacity-80">{block.notes}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Grade de horários */}
        <div className="grid" style={COLUMNS}>
          <div aria-hidden="true">
            {hours.map((minutes) => (
              <div
                key={minutes}
                className="relative pr-1.5 text-right font-mono text-[0.6875rem] text-muted-foreground tabular"
                style={{ height: HOUR_PX }}
              >
                <span className="relative -top-2">
                  {minutes > range.start ? fromMinutes(minutes) : ""}
                </span>
              </div>
            ))}
          </div>
          {DISPLAY_WEEKDAYS.map((day) => (
            <div
              key={day}
              role="group"
              aria-label={`Horários de ${weekdayLong(day)}`}
              className={cn(
                "relative cursor-cell border-l border-border",
                day === today && "bg-primary/[0.03]",
              )}
              style={{ height }}
              onClick={createAt(day)}
            >
              <div aria-hidden="true" className="pointer-events-none">
                {hours.map((minutes) => (
                  <div
                    key={minutes}
                    className="border-t border-border/60 first:border-t-0"
                    style={{ height: HOUR_PX }}
                  />
                ))}
              </div>
              {timedBlocksOn(blocks, day).map((block) => {
                const top = toPx(toMinutes(block.startTime));
                const blockHeight = toPx(toMinutes(block.endTime)) - top;
                const isCurrent = day === today && block.id === current?.id;
                return (
                  <button
                    key={block.id}
                    type="button"
                    aria-label={`${block.title}, ${weekdayLong(day)}, ${blockTimeLabel(block)}${isCurrent ? ", agora" : ""}`}
                    title={`${block.title} · ${blockTimeLabel(block)}${block.notes === "" ? "" : `\n${block.notes}`}`}
                    onClick={() => {
                      onEdit(block);
                    }}
                    className={cn(
                      "absolute inset-x-0.5 flex cursor-pointer flex-col justify-start overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-xs leading-tight transition-shadow hover:shadow-card",
                      categoryBlockClass[block.color],
                      isCurrent && "ring-2 ring-primary",
                    )}
                    style={{ top: top + 1, height: Math.max(blockHeight - 2, 14) }}
                  >
                    <span className="block truncate font-medium">{block.title}</span>
                    {blockHeight >= TIME_MIN_PX && (
                      <span className="block truncate font-mono text-[0.6875rem] tabular opacity-75">
                        {blockTimeLabel(block)}
                      </span>
                    )}
                    {blockHeight >= TIME_MIN_PX * 2 && block.notes !== "" && (
                      <span className="line-clamp-2 text-[0.6875rem] opacity-75">
                        {block.notes}
                      </span>
                    )}
                  </button>
                );
              })}
              {day === today && nowMinutes >= range.start && nowMinutes < range.end && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                  style={{ top: toPx(nowMinutes) - 1 }}
                >
                  <span className="-ml-1 size-2 rounded-full bg-primary" />
                  <span className="h-0.5 flex-1 bg-primary" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
