import { ChartColumn } from "lucide-react";

import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { CashflowChart, CashflowLegend } from "@/features/finance/components/cashflow-chart";
import { type FinanceOverview } from "@/features/finance/types";
import { type AsyncResource } from "@/hooks/use-async-resource";

interface CashflowChartWidgetProps {
  overview: AsyncResource<FinanceOverview>;
  className?: string;
}

/** Receita x despesas dos últimos 6 meses, com os lançamentos reais. */
export function CashflowChartWidget({ overview, className }: CashflowChartWidgetProps) {
  return (
    <WidgetCard
      title="Receita x despesas · 6 meses"
      icon={ChartColumn}
      className={className}
      headerExtra={<CashflowLegend />}
    >
      <ResourceView resource={overview} className="py-6">
        {(data) => <CashflowChart history={data.history} />}
      </ResourceView>
    </WidgetCard>
  );
}
