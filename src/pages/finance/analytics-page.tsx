import { ArrowRight, ChartColumn, History, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { paths } from "@/app/router/paths";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsView } from "@/features/finance/components/analytics-view";
import { ProjectionView } from "@/features/finance/components/projection-view";
import { type AnalyticsPeriod, analyticsSpan } from "@/features/finance/domain/analytics";
import { useFinanceAnalytics, useFinanceProjection } from "@/features/finance/hooks/use-finance";
import { toIsoDate } from "@/lib/dates";
import { type IsoDate } from "@/types/common";

type AnalyticsTab = "history" | "projection";

/** A aba fica na URL (`?tab=projection`), para voltar a ela ao navegar. */
const ANALYTICS_TAB_PARAM = "tab";

function HistoryTab({ today }: { today: IsoDate }) {
  const [period, setPeriod] = useState<AnalyticsPeriod>("12m");
  const span = useMemo(() => analyticsSpan(period, today), [period, today]);
  const resource = useFinanceAnalytics(span);
  return (
    <AnalyticsView resource={resource} period={period} span={span} onPeriodChange={setPeriod} />
  );
}

function ProjectionTab() {
  return <ProjectionView resource={useFinanceProjection()} />;
}

export function AnalyticsPage() {
  const today = toIsoDate(new Date());
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: AnalyticsTab =
    searchParams.get(ANALYTICS_TAB_PARAM) === "projection" ? "projection" : "history";

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Receita, despesas, categorias e patrimônio mês a mês, e a projeção dos próximos meses."
        icon={ChartColumn}
        actions={
          <Button asChild variant="secondary">
            <Link to={paths.finance.overview}>
              Visão Geral
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        }
      />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setSearchParams({ [ANALYTICS_TAB_PARAM]: value }, { replace: true });
        }}
        className="gap-6"
      >
        <TabsList aria-label="Visão">
          <TabsTrigger value="history">
            <History aria-hidden="true" />
            Histórico
          </TabsTrigger>
          <TabsTrigger value="projection">
            <TrendingUp aria-hidden="true" />
            Projeção
          </TabsTrigger>
        </TabsList>
        <TabsContent value="history">
          <HistoryTab today={today} />
        </TabsContent>
        <TabsContent value="projection">
          <ProjectionTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
