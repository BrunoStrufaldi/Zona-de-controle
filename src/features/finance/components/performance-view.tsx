import {
  ArrowDownUp,
  ChartLine,
  CircleDollarSign,
  Coins,
  Info,
  Table2,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssetPerformanceTable } from "@/features/finance/components/asset-performance-table";
import { Metric } from "@/features/finance/components/finance-metrics";
import { IncomeChart } from "@/features/finance/components/income-chart";
import { MaturitiesCard } from "@/features/finance/components/maturities-card";
import {
  PortfolioEvolutionChart,
  PortfolioEvolutionLegend,
} from "@/features/finance/components/portfolio-evolution-chart";
import { formatGain, formatGainRate } from "@/features/finance/domain/investments";
import {
  describeRange,
  PERFORMANCE_PERIODS,
  type PerformancePeriod,
  performancePeriodLabels,
} from "@/features/finance/domain/performance";
import { type DateRange } from "@/features/finance/domain/period";
import { type InvestmentsPerformance } from "@/features/finance/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { formatCents } from "@/lib/format";

interface PerformanceViewProps {
  resource: AsyncResource<InvestmentsPerformance>;
  period: PerformancePeriod;
  range: DateRange;
  onPeriodChange: (period: PerformancePeriod) => void;
}

/** Resultado do período, evolução da carteira, proventos e vencimentos. */
export function PerformanceView({ resource, period, range, onPeriodChange }: PerformanceViewProps) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={period}
          onValueChange={(value) => {
            onPeriodChange(value as PerformancePeriod);
          }}
        >
          <TabsList aria-label="Período">
            {PERFORMANCE_PERIODS.map((item) => (
              <TabsTrigger key={item} value={item}>
                {performancePeriodLabels[item]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <span className="text-sm text-muted-foreground">{describeRange(range)}</span>
      </div>

      <ResourceView resource={resource} loadingLabel="Calculando o desempenho…">
        {(data) =>
          data.months.length === 0 ? (
            <EmptyState
              icon={ChartLine}
              title="Nada para mostrar ainda"
              description="Registre as aplicações e informe os valores dos ativos na aba Carteira para acompanhar o desempenho."
              className="py-16"
            />
          ) : (
            <PerformanceContent data={data} />
          )
        }
      </ResourceView>
    </div>
  );
}

function PerformanceContent({ data }: { data: InvestmentsPerformance }) {
  const { totals } = data;
  const net = totals.contributed - totals.withdrawn;
  const hasIncome = data.months.some((month) => month.income > 0);

  return (
    <div className="@container">
      <div className="grid gap-6">
        <WidgetCard title="Resultado do período" icon={Wallet}>
          <dl className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
            <Metric
              label="Resultado"
              value={formatGain(totals.gain)}
              note={
                totals.rate === null
                  ? "sem capital no período"
                  : `${formatGainRate(totals.rate)} de rentabilidade`
              }
              icon={TrendingUp}
              tone={totals.gain < 0 ? "danger" : "success"}
            />
            <Metric
              label="Valor no fim"
              value={formatCents(totals.endValue)}
              note={`no início: ${formatCents(totals.startValue)}`}
              icon={Coins}
              tone="primary"
            />
            <Metric
              label="Aplicado no período"
              value={formatCents(net)}
              note={`${formatCents(totals.contributed)} aplicados · ${formatCents(totals.withdrawn)} resgatados`}
              icon={ArrowDownUp}
              tone="primary"
            />
            <Metric
              label="Proventos"
              value={formatCents(totals.income)}
              note="já somados ao resultado"
              icon={CircleDollarSign}
              tone="success"
            />
          </dl>
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {totals.approximateAssets > 0
              ? `${totals.approximateAssets === 1 ? "1 ativo está" : `${totals.approximateAssets} ativos estão`} sem valor informado recente no início ou no fim do período: o resultado deles considera só o que foi aplicado. Atualize os valores na aba Carteira para um resultado exato.`
              : "Resultado = valor no fim − valor no início − aplicações + resgates + proventos. A rentabilidade desconta o tempo que cada aplicação ficou investida no período."}
          </p>
        </WidgetCard>

        <WidgetCard
          title="Evolução da carteira"
          icon={ChartLine}
          headerExtra={<PortfolioEvolutionLegend />}
        >
          <PortfolioEvolutionChart months={data.months} />
        </WidgetCard>

        <div className="grid gap-6 @4xl:grid-cols-2">
          <WidgetCard title="Proventos por mês" icon={CircleDollarSign}>
            {hasIncome ? (
              <IncomeChart months={data.months} />
            ) : (
              <EmptyState
                icon={CircleDollarSign}
                title="Nenhum provento registrado"
                description="Dividendos, juros e rendimentos entram pela opção Registrar provento de cada ativo."
                className="border-0 py-6"
              />
            )}
          </WidgetCard>
          <MaturitiesCard maturities={data.maturities} />
        </div>

        <WidgetCard title="Por ativo" icon={Table2}>
          {data.assets.length === 0 ? (
            <EmptyState
              icon={Table2}
              title="Nenhum ativo com valor neste período"
              className="border-0 py-6"
            />
          ) : (
            <AssetPerformanceTable assets={data.assets} />
          )}
        </WidgetCard>
      </div>
    </div>
  );
}
