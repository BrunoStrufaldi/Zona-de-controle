import { CalendarCheck, Cpu, Wallet } from "lucide-react";
import { useCallback } from "react";

import { paths } from "@/app/router/paths";
import { RECENT_ACTIVITY_LIMIT } from "@/features/activity/domain/activity";
import { CashflowChartWidget } from "@/features/finance/components/cashflow-chart-widget";
import { FinanceSummaryWidget } from "@/features/finance/components/finance-summary-widget";
import { InvestmentsWidget } from "@/features/finance/components/investments-widget";
import { UpcomingBillsWidget } from "@/features/finance/components/upcoming-bills-widget";
import { monthOf } from "@/features/finance/domain/period";
import { UPCOMING_DAYS } from "@/features/finance/domain/recurring";
import { UpcomingEventsWidget } from "@/features/productivity/calendar/components/upcoming-events-widget";
import { RoutinesTodayWidget } from "@/features/productivity/routines/components/routines-today-widget";
import { TasksSummaryWidget } from "@/features/productivity/tasks/components/tasks-summary-widget";
import { NowNextWidget } from "@/features/productivity/weekly-plan/components/now-next-widget";
import { StorageWidget } from "@/features/system/components/storage-widget";
import { DiagnosticsWidget } from "@/features/system/diagnostics/components/diagnostics-widget";
import { SystemStatusWidget } from "@/features/system/components/system-status-widget";
import { DeviceBatteryWidget } from "@/features/system/devices/components/device-battery-widget";
import { CleanupWidget } from "@/features/system/optimization/components/cleanup-widget";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { usePollingResource } from "@/hooks/use-polling-resource";
import { useDisplayName } from "@/hooks/use-display-name";
import { addDays, toIsoDate } from "@/lib/dates";
import { listRecentActivity } from "@/services/activity-service";
import { listCalendar } from "@/services/calendar-service";
import { getFinanceOverview, listRecurring } from "@/services/finance-service";
import { getInvestmentsOverview } from "@/services/investments-service";
import { listBatteryDevices } from "@/services/devices-service";
import { runDiagnostics } from "@/services/diagnostics-service";
import { listCleanupHistory } from "@/services/optimization-service";
import { listRoutines } from "@/services/routines-service";
import { getSystemSnapshot } from "@/services/system-service";
import { listTasks } from "@/services/tasks-service";
import { listWeeklyPlan } from "@/services/weekly-plan-service";
import { DashboardSection } from "@/pages/dashboard/components/dashboard-section";
import { GreetingBanner } from "@/pages/dashboard/components/greeting-banner";
import { RecentActivityWidget } from "@/pages/dashboard/components/recent-activity-widget";

/** No dashboard o status do sistema não precisa do ritmo da tela Monitoramento. */
const SYSTEM_INTERVAL_MS = 5_000;

/** Só a última limpeza (os totais vêm junto). */
function loadLastCleanup() {
  return listCleanupHistory(1);
}

function loadActivity() {
  return listRecentActivity(RECENT_ACTIVITY_LIMIT);
}

/** Bateria muda devagar. */
const DEVICES_INTERVAL_MS = 60_000;

/**
 * Dashboard. Widgets de módulos já implementados usam dados reais (Tarefas,
 * Rotinas, Calendário, status do sistema, armazenamento, diagnóstico, bateria,
 * limpeza, finanças, vencimentos das recorrentes, investimentos, planejamento
 * semanal e atividades recentes). Widgets de módulos futuros podem usar dados
 * de `src/mocks`, sempre marcados como Demo; ao implementar o módulo, troque a
 * fonte pelo serviço real e remova `demo`.
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
  const plan = useAsyncResource(listWeeklyPlan);
  const activity = useAsyncResource(loadActivity);

  return (
    <>
      <GreetingBanner displayName={displayName} />

      {/* Larguras escolhidas para as linhas fecharem com 2 e com 3 colunas. */}
      <DashboardSection title="Seu dia" icon={CalendarCheck}>
        <NowNextWidget plan={plan} />
        <TasksSummaryWidget tasks={tasks} />
        <RoutinesTodayWidget routines={routines} />
        <UpcomingEventsWidget agenda={upcoming} today={today} />
        <RecentActivityWidget activity={activity} className="@3xl:col-span-2" />
      </DashboardSection>

      <DashboardSection
        title="Finanças"
        icon={Wallet}
        link={{ label: "Abrir Finanças", to: paths.finance.overview }}
      >
        <FinanceSummaryWidget overview={finance} />
        <UpcomingBillsWidget recurring={bills} />
        <InvestmentsWidget investments={investments} />
        <CashflowChartWidget overview={finance} className="@6xl:col-span-3" />
      </DashboardSection>

      <DashboardSection
        title="Sistema"
        icon={Cpu}
        link={{ label: "Abrir Monitoramento", to: paths.system.monitor }}
      >
        <SystemStatusWidget snapshot={system} />
        <DiagnosticsWidget report={diagnostics} />
        <DeviceBatteryWidget devices={devices} showLink />
        <StorageWidget snapshot={system} className="@6xl:col-span-2" />
        <CleanupWidget history={cleanup} className="@3xl:col-span-2 @6xl:col-span-1" />
      </DashboardSection>
    </>
  );
}
