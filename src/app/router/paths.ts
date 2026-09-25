/**
 * Caminhos das rotas. Fonte única usada pelo roteador, pela navegação e
 * pelos links — nunca escreva caminhos literais nos componentes.
 */
export const paths = {
  dashboard: "/",
  productivity: {
    tasks: "/productivity/tasks",
    notes: "/productivity/notes",
    routines: "/productivity/routines",
    calendar: "/productivity/calendar",
  },
  system: {
    monitor: "/system/monitor",
    devices: "/system/devices",
    diagnostics: "/system/diagnostics",
    optimization: "/system/optimization",
  },
  finance: {
    overview: "/finance",
    transactions: "/finance/transactions",
    recurring: "/finance/recurring",
    installments: "/finance/installments",
    investments: "/finance/investments",
    analytics: "/finance/analytics",
  },
  settings: "/settings",
} as const;
