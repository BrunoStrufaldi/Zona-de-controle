import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import { AppProviders } from "@/app/providers/app-providers";
import { routes } from "@/app/router/routes";

/**
 * Importa antecipadamente o chunk do dashboard (inclui o Recharts). Use em
 * `beforeAll` nos testes que renderizam o dashboard: a importação a frio pode
 * levar vários segundos na primeira execução (ex.: CI, cache vazio) e não deve
 * contar no tempo de espera das asserções.
 */
export async function preloadDashboard(): Promise<void> {
  await import("@/pages/dashboard/dashboard-page");
}

/** Como `preloadDashboard`, para a página de Monitoramento (também usa o Recharts). */
export async function preloadMonitor(): Promise<void> {
  await import("@/pages/system/monitor-page");
}

/** Como `preloadDashboard`, para a Visão Geral das Finanças (também usa o Recharts). */
export async function preloadFinanceOverview(): Promise<void> {
  await import("@/pages/finance/finance-overview-page");
}

/** Como `preloadDashboard`, para Investimentos (a aba Desempenho usa o Recharts). */
export async function preloadInvestments(): Promise<void> {
  await import("@/pages/finance/investments-page");
}

/** Como `preloadDashboard`, para Parcelamentos (também usa o Recharts). */
export async function preloadInstallments(): Promise<void> {
  await import("@/pages/finance/installments-page");
}

/** Renderiza a aplicação completa (layout + rotas) em um caminho específico. */
export function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...result, router };
}
