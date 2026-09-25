import { CashflowChartWidget } from "@/features/finance/components/cashflow-chart-widget";
import { FinanceSummaryWidget } from "@/features/finance/components/finance-summary-widget";
import { RoutineProgressWidget } from "@/features/productivity/components/routine-progress-widget";
import { TasksSummaryWidget } from "@/features/productivity/components/tasks-summary-widget";
import { StorageWidget } from "@/features/system/components/storage-widget";
import { SystemStatusWidget } from "@/features/system/components/system-status-widget";
import { DeviceBatteryWidget } from "@/features/system/devices/components/device-battery-widget";
import { dashboardDemoData as demo } from "@/mocks/dashboard";
import { GreetingBanner } from "@/pages/dashboard/components/greeting-banner";
import { RecentActivityWidget } from "@/pages/dashboard/components/recent-activity-widget";

/**
 * Dashboard inicial. Enquanto os módulos não existem, os widgets recebem dados
 * de `src/mocks` e são marcados como Demo. Ao implementar um módulo, troque a
 * fonte do widget pelo serviço real e remova a flag `demo`.
 */
export function DashboardPage() {
  return (
    <>
      <GreetingBanner />

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <TasksSummaryWidget data={demo.tasks} demo />
        <RoutineProgressWidget data={demo.routine} demo />
        <SystemStatusWidget data={demo.system} demo />

        <FinanceSummaryWidget income={demo.finance.income} expenses={demo.finance.expenses} demo />
        <CashflowChartWidget data={demo.cashflow} demo className="md:col-span-2 xl:col-span-2" />

        <StorageWidget volumes={demo.storage} demo />
        <DeviceBatteryWidget devices={demo.devices} demo />
        <RecentActivityWidget entries={demo.activity} demo />
      </div>
    </>
  );
}
