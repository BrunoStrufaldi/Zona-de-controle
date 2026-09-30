import { ArrowRight, Coins, Landmark, Plus, TrendingUp, TriangleAlert } from "lucide-react";
import { Link } from "react-router";

import { paths } from "@/app/router/paths";
import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Button } from "@/components/ui/button";
import { Metric } from "@/features/finance/components/finance-metrics";
import { formatGainWithRate } from "@/features/finance/domain/investments";
import { type InvestmentsOverview } from "@/features/finance/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { formatCents } from "@/lib/format";

interface InvestmentsWidgetProps {
  investments: AsyncResource<InvestmentsOverview>;
  className?: string;
}

/** Carteira e patrimônio no dashboard, com os valores informados pelo usuário. */
export function InvestmentsWidget({ investments, className }: InvestmentsWidgetProps) {
  return (
    <WidgetCard
      title="Investimentos"
      icon={TrendingUp}
      className={className}
      headerExtra={
        <Button asChild variant="ghost" size="sm" className="h-7 px-2">
          <Link to={paths.finance.investments}>
            Carteira
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <ResourceView resource={investments} className="py-6">
        {(data) => {
          if (data.assets.length === 0) {
            return (
              <EmptyState
                icon={TrendingUp}
                title="Nenhum investimento cadastrado"
                className="border-0 py-6"
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link to={paths.finance.investments}>
                      <Plus aria-hidden="true" />
                      Cadastrar ativos
                    </Link>
                  </Button>
                }
              />
            );
          }
          const { totals, netWorth } = data;
          return (
            <div className="grid gap-3">
              <dl className="grid grid-cols-2 gap-3">
                <Metric
                  label="Carteira"
                  value={formatCents(totals.value)}
                  note={formatGainWithRate({
                    gain: totals.gain,
                    gainRate: totals.contributed > 0 ? totals.gain / totals.contributed : null,
                  })}
                  icon={Coins}
                  tone={totals.gain < 0 ? "danger" : "success"}
                />
                <Metric
                  label="Patrimônio total"
                  value={formatCents(netWorth.total)}
                  note="contas + carteira"
                  icon={Landmark}
                  tone="primary"
                />
              </dl>
              {data.staleCount > 0 && (
                <p className="flex items-center gap-2 text-xs text-warning">
                  <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                  {data.staleCount === 1
                    ? "1 ativo precisa do valor atualizado"
                    : `${data.staleCount} ativos precisam do valor atualizado`}
                </p>
              )}
            </div>
          );
        }}
      </ResourceView>
    </WidgetCard>
  );
}
