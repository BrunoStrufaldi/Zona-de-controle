import { type ComponentType } from "react";
import { type RouteObject } from "react-router";

import { AppLayout } from "@/app/layouts/app-layout";
import { AppLoading } from "@/app/layouts/app-loading";
import { paths } from "@/app/router/paths";
import { RouteErrorPage } from "@/pages/errors/route-error-page";
import { NotFoundPage } from "@/pages/not-found/not-found-page";

/** Carrega a página sob demanda (code splitting por rota). */
function lazyPage(load: () => Promise<ComponentType>): RouteObject["lazy"] {
  return async () => ({ Component: await load() });
}

/**
 * Árvore de rotas. Para adicionar uma página: crie-a em src/pages, registre o
 * caminho em `paths`, adicione a rota aqui e o item em src/config/navigation.ts.
 */
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    HydrateFallback: AppLoading,
    errorElement: <RouteErrorPage />,
    children: [
      {
        errorElement: <RouteErrorPage />,
        children: [
          {
            index: true,
            lazy: lazyPage(() =>
              import("@/pages/dashboard/dashboard-page").then((m) => m.DashboardPage),
            ),
          },

          // Produtividade
          {
            path: paths.productivity.tasks,
            lazy: lazyPage(() =>
              import("@/pages/productivity/tasks-page").then((m) => m.TasksPage),
            ),
          },
          {
            path: paths.productivity.notes,
            lazy: lazyPage(() =>
              import("@/pages/productivity/notes-page").then((m) => m.NotesPage),
            ),
          },
          {
            path: paths.productivity.routines,
            lazy: lazyPage(() =>
              import("@/pages/productivity/routines-page").then((m) => m.RoutinesPage),
            ),
          },
          {
            path: paths.productivity.calendar,
            lazy: lazyPage(() =>
              import("@/pages/productivity/calendar-page").then((m) => m.CalendarPage),
            ),
          },

          // Sistema
          {
            path: paths.system.monitor,
            lazy: lazyPage(() => import("@/pages/system/monitor-page").then((m) => m.MonitorPage)),
          },
          {
            path: paths.system.devices,
            lazy: lazyPage(() => import("@/pages/system/devices-page").then((m) => m.DevicesPage)),
          },
          {
            path: paths.system.diagnostics,
            lazy: lazyPage(() =>
              import("@/pages/system/diagnostics-page").then((m) => m.DiagnosticsPage),
            ),
          },
          {
            path: paths.system.optimization,
            lazy: lazyPage(() =>
              import("@/pages/system/optimization-page").then((m) => m.OptimizationPage),
            ),
          },

          // Finanças
          {
            path: paths.finance.overview,
            lazy: lazyPage(() =>
              import("@/pages/finance/finance-overview-page").then((m) => m.FinanceOverviewPage),
            ),
          },
          {
            path: paths.finance.transactions,
            lazy: lazyPage(() =>
              import("@/pages/finance/transactions-page").then((m) => m.TransactionsPage),
            ),
          },
          {
            path: paths.finance.recurring,
            lazy: lazyPage(() =>
              import("@/pages/finance/recurring-page").then((m) => m.RecurringPage),
            ),
          },
          {
            path: paths.finance.installments,
            lazy: lazyPage(() =>
              import("@/pages/finance/installments-page").then((m) => m.InstallmentsPage),
            ),
          },
          {
            path: paths.finance.investments,
            lazy: lazyPage(() =>
              import("@/pages/finance/investments-page").then((m) => m.InvestmentsPage),
            ),
          },
          {
            path: paths.finance.analytics,
            lazy: lazyPage(() =>
              import("@/pages/finance/analytics-page").then((m) => m.AnalyticsPage),
            ),
          },

          // Configurações
          {
            path: paths.settings,
            lazy: lazyPage(() =>
              import("@/pages/settings/settings-page").then((m) => m.SettingsPage),
            ),
          },

          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
