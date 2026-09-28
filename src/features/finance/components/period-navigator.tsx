import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  monthOf,
  periodLabel,
  shiftPeriod,
  type FinancePeriod,
} from "@/features/finance/domain/period";
import { type IsoDate } from "@/types/common";

interface PeriodNavigatorProps {
  period: FinancePeriod;
  onChange: (period: FinancePeriod) => void;
  today: IsoDate;
  /** Mostra a escolha entre mês e ano (tela de lançamentos). */
  allowYear?: boolean;
}

/** Navegação por mês (ou ano): anterior, próximo e volta ao atual. */
export function PeriodNavigator({
  period,
  onChange,
  today,
  allowYear = false,
}: PeriodNavigatorProps) {
  const currentMonth = monthOf(today);
  const currentYear = Number(today.slice(0, 4));
  const isCurrent =
    period.kind === "month" ? period.month === currentMonth : period.year === currentYear;
  const labels =
    period.kind === "month"
      ? { previous: "Mês anterior", next: "Próximo mês", current: "Mês atual" }
      : { previous: "Ano anterior", next: "Próximo ano", current: "Ano atual" };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {allowYear && (
        <Tabs
          value={period.kind}
          onValueChange={(value) => {
            onChange(
              value === "year"
                ? {
                    kind: "year",
                    year: period.kind === "month" ? Number(period.month.slice(0, 4)) : period.year,
                  }
                : {
                    kind: "month",
                    month:
                      period.kind === "year" && period.year !== currentYear
                        ? `${period.year}-01`
                        : currentMonth,
                  },
            );
          }}
        >
          <TabsList aria-label="Período">
            <TabsTrigger value="month">Mês</TabsTrigger>
            <TabsTrigger value="year">Ano</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={labels.previous}
          onClick={() => {
            onChange(shiftPeriod(period, -1));
          }}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <p
          className="min-w-40 text-center text-sm font-medium first-letter:uppercase"
          aria-live="polite"
        >
          {periodLabel(period)}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={labels.next}
          onClick={() => {
            onChange(shiftPeriod(period, 1));
          }}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      {!isCurrent && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            onChange(
              period.kind === "month"
                ? { kind: "month", month: currentMonth }
                : { kind: "year", year: currentYear },
            );
          }}
        >
          {labels.current}
        </Button>
      )}
    </div>
  );
}
