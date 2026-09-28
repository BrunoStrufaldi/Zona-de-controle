import { ArrowRight, CalendarDays, Plus } from "lucide-react";
import { Link } from "react-router";

import { newEventHref, paths } from "@/app/router/paths";
import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Button } from "@/components/ui/button";
import { occurrenceKey, timeRangeLabel } from "@/features/productivity/calendar/domain/agenda";
import { type CalendarAgenda } from "@/features/productivity/calendar/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { cn } from "@/lib/cn";
import { addDays, weekdayOf } from "@/lib/dates";
import { formatDayMonth } from "@/lib/format";
import { categoryDotClass } from "@/lib/palette";
import { weekdayShort } from "@/lib/weekdays";
import { type IsoDate } from "@/types/common";

/** Eventos exibidos no máximo. */
const MAX_ITEMS = 6;

interface UpcomingEventsWidgetProps {
  /** Agenda de hoje até 6 dias depois. */
  agenda: AsyncResource<CalendarAgenda>;
  today: IsoDate;
}

function dayLabel(date: IsoDate, today: IsoDate): string {
  if (date <= today) return "Hoje";
  if (date === addDays(today, 1)) return "Amanhã";
  return `${weekdayShort(weekdayOf(date))} ${formatDayMonth(date)}`;
}

/** Próximos eventos dos 7 dias seguintes (dados reais). */
export function UpcomingEventsWidget({ agenda, today }: UpcomingEventsWidgetProps) {
  return (
    <WidgetCard
      title="Próximos eventos"
      icon={CalendarDays}
      headerExtra={
        <Button asChild variant="ghost" size="sm" className="h-7 px-2">
          <Link to={paths.productivity.calendar}>
            Calendário
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <ResourceView resource={agenda} className="py-6">
        {(data) => {
          if (data.occurrences.length === 0) {
            return (
              <EmptyState
                icon={CalendarDays}
                title="Nada nos próximos 7 dias"
                className="border-0 py-6"
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link to={newEventHref}>
                      <Plus aria-hidden="true" />
                      Novo evento
                    </Link>
                  </Button>
                }
              />
            );
          }
          const shown = data.occurrences.slice(0, MAX_ITEMS);
          const hidden = data.occurrences.length - shown.length;
          return (
            <div className="grid gap-2">
              <ul className="grid gap-2" aria-label="Próximos eventos">
                {shown.map((occurrence) => (
                  <li key={occurrenceKey(occurrence)} className="flex items-center gap-2.5 text-sm">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        categoryDotClass[occurrence.color],
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{occurrence.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground first-letter:uppercase">
                      {dayLabel(occurrence.startDate, today)} · {timeRangeLabel(occurrence)}
                    </span>
                  </li>
                ))}
              </ul>
              {hidden > 0 && (
                <p className="text-xs text-muted-foreground">
                  e mais {hidden} {hidden === 1 ? "evento" : "eventos"}
                </p>
              )}
            </div>
          );
        }}
      </ResourceView>
    </WidgetCard>
  );
}
