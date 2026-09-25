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
