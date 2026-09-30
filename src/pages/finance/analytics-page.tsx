import { ArrowRight, ChartColumn } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";

import { paths } from "@/app/router/paths";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { AnalyticsView } from "@/features/finance/components/analytics-view";
import { type AnalyticsPeriod, analyticsSpan } from "@/features/finance/domain/analytics";
import { useFinanceAnalytics } from "@/features/finance/hooks/use-finance";
import { toIsoDate } from "@/lib/dates";

export function AnalyticsPage() {
  const today = toIsoDate(new Date());
  const [period, setPeriod] = useState<AnalyticsPeriod>("12m");
  const span = useMemo(() => analyticsSpan(period, today), [period, today]);
  const resource = useFinanceAnalytics(span);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Receita, despesas, categorias e patrimônio mês a mês."
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
      <AnalyticsView resource={resource} period={period} span={span} onPeriodChange={setPeriod} />
    </>
  );
}
