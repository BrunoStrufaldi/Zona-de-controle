import { useCallback } from "react";

import { CashflowChartWidget } from "@/features/finance/components/cashflow-chart-widget";
import { FinanceSummaryWidget } from "@/features/finance/components/finance-summary-widget";
import { InvestmentsWidget } from "@/features/finance/components/investments-widget";
import { UpcomingBillsWidget } from "@/features/finance/components/upcoming-bills-widget";
import { monthOf } from "@/features/finance/domain/period";
import { UPCOMING_DAYS } from "@/features/finance/domain/recurring";
import { UpcomingEventsWidget } from "@/features/productivity/calendar/components/upcoming-events-widget";
import { RoutinesTodayWidget } from "@/features/productivity/routines/components/routines-today-widget";
import { TasksSummaryWidget } from "@/features/productivity/tasks/components/tasks-summary-widget";
import { StorageWidget } from "@/features/system/components/storage-widget";
import { DiagnosticsWidget } from "@/features/system/diagnostics/components/diagnostics-widget";
import { SystemStatusWidget } from "@/features/system/components/system-status-widget";
import { DeviceBatteryWidget } from "@/features/system/devices/components/device-battery-widget";
import { CleanupWidget } from "@/features/system/optimization/components/cleanup-widget";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { usePollingResource } from "@/hooks/use-polling-resource";
import { useDisplayName } from "@/hooks/use-display-name";
import { addDays, toIsoDate } from "@/lib/dates";
import { dashboardDemoData as demo } from "@/mocks/dashboard";
import { listCalendar } from "@/services/calendar-service";
import { getFinanceOverview, listRecurring } from "@/services/finance-service";
import { getInvestmentsOverview } from "@/services/investments-service";
import { listBatteryDevices } from "@/services/devices-service";
import { runDiagnostics } from "@/services/diagnostics-service";
import { listCleanupHistory } from "@/services/optimization-service";
import { listRoutines } from "@/services/routines-service";
import { getSystemSnapshot } from "@/services/system-service";
import { listTasks } from "@/services/tasks-service";
import { GreetingBanner } from "@/pages/dashboard/components/greeting-banner";
import { RecentActivityWidget } from "@/pages/dashboard/components/recent-activity-widget";

/** No dashboard o status do sistema não precisa do ritmo da tela Monitoramento. */
const SYSTEM_INTERVAL_MS = 5_000;

/** Só a última limpeza (os totais vêm junto). */
function loadLastCleanup() {
  return listCleanupHistory(1);
}

/** Bateria muda devagar. */
const DEVICES_INTERVAL_MS = 60_000;

/**
 * Dashboard. Widgets de módulos já implementados usam dados reais (Tarefas,
 * Rotinas, Calendário, status do sistema, armazenamento, diagnóstico, bateria,
 * limpeza, finanças, vencimentos das recorrentes e investimentos);
 * os demais ainda recebem dados de `src/mocks` e são marcados como Demo. Ao
 * implementar um módulo, troque a fonte do widget pelo serviço real e remova `demo`.
 */
export function DashboardPage() {
  const displayName = useDisplayName();
  const tasks = useAsyncResource(listTasks);
  const routines = useAsyncResource(listRoutines);
  const today = toIsoDate(new Date());
  const loadWeek = useCallback(() => listCalendar(today, addDays(today, 6)), [today]);
  const upcoming = useAsyncResource(loadWeek);
  const system = usePollingResource(getSystemSnapshot, { intervalMs: SYSTEM_INTERVAL_MS });
  const diagnostics = useAsyncResource(runDiagnostics);
  const devices = usePollingResource(listBatteryDevices, { intervalMs: DEVICES_INTERVAL_MS });
  const cleanup = useAsyncResource(loadLastCleanup);
  const loadFinance = useCallback(() => getFinanceOverview(monthOf(today)), [today]);
  const finance = useAsyncResource(loadFinance);
  const loadBills = useCallback(() => listRecurring(today, addDays(today, UPCOMING_DAYS)), [today]);
  const bills = useAsyncResource(loadBills);
  const investments = useAsyncResource(getInvestmentsOverview);

  return (
    <>
      <GreetingBanner displayName={displayName} />

      {/* Colunas pela largura da área de conteúdo (container query), não da janela. */}
      <div className="@container">
        <div className="grid gap-6 @3xl:grid-cols-2 @6xl:grid-cols-3">
          <TasksSummaryWidget tasks={tasks} />
          <RoutinesTodayWidget routines={routines} />
          <UpcomingEventsWidget agenda={upcoming} today={today} />
          <SystemStatusWidget snapshot={system} />

          <FinanceSummaryWidget overview={finance} />
          <UpcomingBillsWidget recurring={bills} />
          <InvestmentsWidget investments={investments} />
          <CashflowChartWidget overview={finance} className="@3xl:col-span-2" />
          <CleanupWidget history={cleanup} />

          <StorageWidget snapshot={system} />
          <DiagnosticsWidget report={diagnostics} />
          <DeviceBatteryWidget devices={devices} showLink />
          <RecentActivityWidget entries={demo.activity} demo />
        </div>
      </div>
    </>
  );
}
