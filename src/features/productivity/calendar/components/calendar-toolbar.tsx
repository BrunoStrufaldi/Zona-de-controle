import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { viewLabels, viewTitle } from "@/features/productivity/calendar/domain/range";
import { type CalendarView } from "@/features/productivity/calendar/types";
import { type IsoDate } from "@/types/common";

const VIEW_ICONS = { month: CalendarDays, week: CalendarRange, day: Square } as const;
const VIEWS: readonly CalendarView[] = ["month", "week", "day"];

const PERIOD_NAMES: Record<CalendarView, [string, string]> = {
  month: ["Mês anterior", "Próximo mês"],
  week: ["Semana anterior", "Próxima semana"],
  day: ["Dia anterior", "Próximo dia"],
};

interface CalendarToolbarProps {
  view: CalendarView;
  anchor: IsoDate;
  onViewChange: (view: CalendarView) => void;
  onNavigate: (direction: -1 | 1) => void;
  onToday: () => void;
}

/** Navegação entre períodos e troca de visão (mês, semana, dia). */
export function CalendarToolbar({
  view,
  anchor,
  onViewChange,
  onNavigate,
  onToday,
}: CalendarToolbarProps) {
  const [previous, next] = PERIOD_NAMES[view];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onToday}>
          Hoje
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={previous}
          onClick={() => {
            onNavigate(-1);
          }}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={next}
          onClick={() => {
            onNavigate(1);
          }}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
        <h2 className="truncate text-lg font-semibold first-letter:uppercase" aria-live="polite">
          {viewTitle(view, anchor)}
        </h2>
      </div>
      <Tabs
        value={view}
        onValueChange={(value) => {
          onViewChange(value as CalendarView);
        }}
      >
        <TabsList aria-label="Visão do calendário">
          {VIEWS.map((option) => {
            const Icon = VIEW_ICONS[option];
            return (
              <TabsTrigger key={option} value={option}>
                <Icon aria-hidden="true" />
                {viewLabels[option]}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </div>
  );
}
