import { ArrowRight, Plus, Wallet } from "lucide-react";
import { Link } from "react-router";

import { newTransactionHref, paths } from "@/app/router/paths";
import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Button } from "@/components/ui/button";
import { FinanceMetrics } from "@/features/finance/components/finance-metrics";
import { type FinanceOverview } from "@/features/finance/types";
import { type AsyncResource } from "@/hooks/use-async-resource";

interface FinanceSummaryWidgetProps {
  overview: AsyncResource<FinanceOverview>;
}

/** Resumo do mês no dashboard, com os lançamentos reais. */
export function FinanceSummaryWidget({ overview }: FinanceSummaryWidgetProps) {
  return (
    <WidgetCard
      title="Resumo financeiro do mês"
      icon={Wallet}
      headerExtra={
        <Button asChild variant="ghost" size="sm" className="h-7 px-2">
          <Link to={paths.finance.overview}>
            Finanças
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <ResourceView resource={overview} className="py-6">
        {(data) =>
          data.totals.income === 0 && data.totals.expenses === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Nenhum lançamento neste mês"
              className="border-0 py-6"
              action={
                <Button asChild size="sm" variant="secondary">
                  <Link to={newTransactionHref}>
                    <Plus aria-hidden="true" />
                    Novo lançamento
                  </Link>
                </Button>
              }
            />
          ) : (
            <FinanceMetrics totals={data.totals} />
          )
        }
      </ResourceView>
    </WidgetCard>
  );
}
