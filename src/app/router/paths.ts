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
    diskUsage: "/system/disk-usage",
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

/** Parâmetro de URL que abre o formulário de nova tarefa na página de Tarefas. */
export const NEW_TASK_PARAM = "new";

/** Link para criar uma tarefa (usado pelo menu "Criar" do header). */
export const newTaskHref = `${paths.productivity.tasks}?${NEW_TASK_PARAM}=1`;

/** Parâmetro de URL que abre a edição de uma tarefa (ex.: vinda do calendário). */
export const OPEN_TASK_PARAM = "task";

/** Link para abrir uma tarefa na página de Tarefas. */
export function taskHref(id: number): string {
  return `${paths.productivity.tasks}?${OPEN_TASK_PARAM}=${id}`;
}

/** Parâmetro de URL que abre o formulário de novo evento na página do Calendário. */
export const NEW_EVENT_PARAM = "new";

/** Link para criar um evento (usado pelo menu "Criar" do header). */
export const newEventHref = `${paths.productivity.calendar}?${NEW_EVENT_PARAM}=1`;

/** Parâmetro de URL que abre uma aba das Configurações (ex.: `?tab=diagnostics`). */
export const SETTINGS_TAB_PARAM = "tab";

/** Link para os limites do diagnóstico em Configurações. */
export const diagnosticThresholdsHref = `${paths.settings}?${SETTINGS_TAB_PARAM}=diagnostics`;

/** Parâmetro de URL que abre uma aba da tela Rotinas (ex.: `?tab=plan`). */
export const ROUTINES_TAB_PARAM = "tab";

/** Link para o planejamento semanal (aba da tela Rotinas). */
export const weeklyPlanHref = `${paths.productivity.routines}?${ROUTINES_TAB_PARAM}=plan`;

/** Parâmetro de URL que analisa uma unidade no Espaço em disco (ex.: `?drive=C:`). */
export const DISK_USAGE_DRIVE_PARAM = "drive";

/** Link para ver o que ocupa uma unidade (card Armazenamento). */
export function diskUsageHref(mountPoint: string): string {
  return `${paths.system.diskUsage}?${DISK_USAGE_DRIVE_PARAM}=${encodeURIComponent(mountPoint)}`;
}

/** Parâmetro de URL que abre o formulário de novo lançamento na página de Lançamentos. */
export const NEW_TRANSACTION_PARAM = "new";

/** Link para criar um lançamento (menu "Criar" do header e dashboard). */
export const newTransactionHref = `${paths.finance.transactions}?${NEW_TRANSACTION_PARAM}=1`;
