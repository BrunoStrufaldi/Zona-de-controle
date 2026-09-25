import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDays } from "@/lib/dates";
import { formatLongDate } from "@/lib/format";
import { type IsoDate } from "@/types/common";

interface JournalNavigatorProps {
  date: IsoDate;
  today: IsoDate;
  onChange: (date: IsoDate) => void;
}

/** Escolha do dia do diário: anterior/seguinte, hoje ou uma data qualquer. */
export function JournalNavigator({ date, today, onChange }: JournalNavigatorProps) {
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dia anterior"
          onClick={() => {
            onChange(addDays(date, -1));
          }}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <p
          className="flex-1 text-center text-sm font-medium first-letter:uppercase"
          aria-live="polite"
        >
          {formatLongDate(date)}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dia seguinte"
          onClick={() => {
            onChange(addDays(date, 1));
          }}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={date}
          aria-label="Ir para a data"
          className="h-8"
          onChange={(event) => {
            if (event.target.value !== "") onChange(event.target.value);
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={date === today}
          onClick={() => {
            onChange(today);
          }}
        >
          Hoje
        </Button>
      </div>
    </div>
  );
}
