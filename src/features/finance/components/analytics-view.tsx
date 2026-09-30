import {
  ArrowDownRight,
  ArrowUpRight,
  ChartColumn,
  ChartLine,
  Info,
  Landmark,
  Scale,
  Wallet,
} from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CashflowChart, CashflowLegend } from "@/features/finance/components/cashflow-chart";
import { CategoryTrendsCard } from "@/features/finance/components/category-trends-card";
import { Metric } from "@/features/finance/components/finance-metrics";
import {
  NetCashflowChart,
  NetCashflowLegend,
} from "@/features/finance/components/net-cashflow-chart";
import { NetWorthChart } from "@/features/finance/components/net-worth-chart";
import {
  ANALYTICS_PERIODS,
  type AnalyticsPeriod,
  analyticsPeriodLabels,
  categoryTrendRows,
  describeSpan,
  monthName,
  type MonthSpan,
  netWorthSummary,
  previousSpan,
} from "@/features/finance/domain/analytics";
import { summarizeCashflow } from "@/features/finance/domain/cashflow";
import { formatGain } from "@/features/finance/domain/investments";
import { monthOf } from "@/features/finance/domain/period";
import { indexById } from "@/features/finance/domain/filters";
import { type AnalyticsData } from "@/features/finance/hooks/use-finance";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { formatCents, formatPercent } from "@/lib/format";

interface AnalyticsViewProps {
  resource: AsyncResource<AnalyticsData>;
  period: AnalyticsPeriod;
  span: MonthSpan;
  onPeriodChange: (period: AnalyticsPeriod) => void;
}

/** Histórico do período: resumo, receita x despesas, sobra, patrimônio e categorias. */
export function AnalyticsView({ resource, period, span, onPeriodChange }: AnalyticsViewProps) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={period}
          onValueChange={(value) => {
            onPeriodChange(value as AnalyticsPeriod);
          }}
        >
          <TabsList aria-label="Período">
            {ANALYTICS_PERIODS.map((item) => (
              <TabsTrigger key={item} value={item}>
                {analyticsPeriodLabels[item]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <span className="text-sm text-muted-foreground">{describeSpan(span)}</span>
      </div>

      <ResourceView resource={resource} loadingLabel="Analisando o histórico…">
        {(data) => {
          const { months } = data.analytics;
          const empty = months.every(
            (row) => row.income === 0 && row.expenses === 0 && row.netWorth === null,
          );
          return empty ? (
            <EmptyState
              icon={ChartColumn}
              title="Nada para analisar neste período"
              description="Registre ou importe lançamentos em Lançamentos para acompanhar receita, despesas e patrimônio mês a mês."
              className="py-16"
            />
          ) : (
            <AnalyticsContent data={data} span={span} />
          );
        }}
      </ResourceView>
    </div>
  );
}

function AnalyticsContent({ data, span }: { data: AnalyticsData; span: MonthSpan }) {
  const { totals, months } = data.analytics;
  const summary = summarizeCashflow(totals.income, totals.expenses);
  const netWorth = netWorthSummary(months);
  const averaged = totals.averageMonths === 1 ? "1 mês" : `${totals.averageMonths} meses`;
  const current = monthOf(data.analytics.today);
  const leavesCurrentOut = months.some((row) => row.month === current) && months.length > 1;

  return (
    <div className="@container">
      <div className="grid gap-6">
        <WidgetCard title="Resumo do período" icon={Wallet}>
          <dl className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
            <Metric
              label="Receita"
              value={formatCents(totals.income)}
              note={`média de ${formatCents(totals.averageIncome)}/mês`}
              icon={ArrowUpRight}
              tone="success"
            />
            <Metric
              label="Despesas"
              value={formatCents(totals.expenses)}
              note={`média de ${formatCents(totals.averageExpenses)}/mês`}
              icon={ArrowDownRight}
              tone="danger"
            />
            <Metric
              label="Receita − despesas"
              value={formatCents(summary.net)}
              note={
                summary.income > 0
                  ? `${formatPercent(summary.savingsRate)} da receita`
                  : "sem receita no período"
              }
              icon={Scale}
              tone={summary.net >= 0 ? "success" : "danger"}
            />
            <Metric
              label="Patrimônio"
              value={netWorth === null ? "—" : formatCents(netWorth.last.point.total)}
              note={
                netWorth === null
                  ? "sem registros no período"
                  : netWorth.first.month === netWorth.last.month
                    ? `em ${monthName(netWorth.last.month)}`
                    : `${formatGain(netWorth.change)} desde ${monthName(netWorth.first.month)}`
              }
              icon={Landmark}
              tone="primary"
            />
          </dl>
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {`Receita e despesas incluem os pendentes; transferências (como aplicações) não são despesa. Médias de ${averaged} desde o primeiro registro${leavesCurrentOut ? "; o mês atual, ainda em andamento, fica de fora" : ""}.`}
          </p>
        </WidgetCard>

        <div className="grid gap-6 @4xl:grid-cols-2">
          <WidgetCard
            title="Receita x despesas"
            icon={ChartColumn}
            headerExtra={<CashflowLegend />}
          >
            <CashflowChart history={months} />
          </WidgetCard>
          <WidgetCard
            title="Receita − despesas por mês"
            icon={Scale}
            headerExtra={<NetCashflowLegend />}
          >
            <NetCashflowChart months={months} />
          </WidgetCard>
        </div>

        <WidgetCard title="Evolução do patrimônio" icon={ChartLine}>
          {netWorth === null ? (
            <EmptyState
              icon={ChartLine}
              title="Nenhum registro até o fim do período"
              className="border-0 py-6"
            />
          ) : (
            <>
              <NetWorthChart months={months} />
              <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Saldo das contas ao fim de cada mês (só o que foi pago; cartões entram negativos)
                mais os investimentos pelo último valor informado. Meses antes do primeiro registro
                ficam sem ponto.
              </p>
            </>
          )}
        </WidgetCard>

        <CategoryTrendsCard
          rows={categoryTrendRows(data.analytics.categories, indexById(data.categories))}
          months={months.map((row) => row.month)}
          previousLabel={describeSpan(previousSpan(span))}
        />
      </div>
    </div>
  );
}
