import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Landmark,
  Plus,
  Repeat,
  Wallet,
} from "lucide-react";
import { Link } from "react-router";

import { paths } from "@/app/router/paths";
import { EmptyState } from "@/components/shared/empty-state";
import { WidgetCard } from "@/components/shared/widget-card";
import { Button } from "@/components/ui/button";
import {
  OccurrenceList,
  type OccurrenceHandlers,
} from "@/features/finance/components/recurring-occurrence-list";
import { RecurringMetrics } from "@/features/finance/components/recurring-metrics";
import { SeriesList } from "@/features/finance/components/recurring-series-list";
import { indexById } from "@/features/finance/domain/filters";
import { type RecurringData } from "@/features/finance/hooks/use-finance";
import { type RecurringSeries } from "@/features/finance/types";

interface RecurringViewProps extends OccurrenceHandlers {
  data: RecurringData;
  /** Ex.: "setembro de 2026". */
  periodLabel: string;
  onCreate: () => void;
  onEdit: (series: RecurringSeries) => void;
  onDelete: (series: RecurringSeries) => void;
}

export function RecurringView({
  data,
  periodLabel,
  onCreate,
  onEdit,
  onDelete,
  ...handlers
}: RecurringViewProps) {
  if (data.accounts.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title="Cadastre uma conta primeiro"
        description="Toda recorrente sai de uma conta (ex.: C6, Nubank, Carteira). As contas ficam em Lançamentos."
        action={
          <Button asChild>
            <Link to={paths.finance.transactions}>
              Ir para Lançamentos
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        }
        className="py-16"
      />
    );
  }

  const { recurring } = data;
  if (recurring.series.length === 0) {
    return (
      <EmptyState
        icon={Repeat}
        title="Nenhuma recorrente ainda"
        description="Cadastre aluguel, internet, assinaturas ou o salário uma vez: os vencimentos de cada mês aparecem sozinhos."
        action={
          <Button onClick={onCreate}>
            <Plus aria-hidden="true" />
            Nova recorrente
          </Button>
        }
        className="py-16"
      />
    );
  }

  const series = indexById(recurring.series);
  const accounts = indexById(data.accounts);
  const categories = indexById(data.categories);
  const lists = { series, accounts, categories, ...handlers };

  return (
    <div className="@container">
      <div className="grid gap-6">
        <WidgetCard title={`Resumo de ${periodLabel}`} icon={Wallet}>
          <RecurringMetrics recurring={recurring} />
        </WidgetCard>

        {recurring.overdue.length > 0 && (
          <WidgetCard title="Atrasadas de meses anteriores" icon={AlertTriangle}>
            <OccurrenceList
              label="Vencimentos atrasados de meses anteriores"
              occurrences={recurring.overdue}
              showYear
              {...lists}
            />
          </WidgetCard>
        )}

        <WidgetCard title={`Vencimentos de ${periodLabel}`} icon={CalendarClock}>
          {recurring.occurrences.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Nenhum vencimento neste mês"
              className="border-0 py-6"
            />
          ) : (
            <OccurrenceList
              label={`Vencimentos de ${periodLabel}`}
              occurrences={recurring.occurrences}
              {...lists}
            />
          )}
        </WidgetCard>

        <WidgetCard title="Todas as recorrentes" icon={Repeat}>
          <SeriesList
            series={recurring.series}
            accounts={accounts}
            categories={categories}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </WidgetCard>
      </div>
    </div>
  );
}
