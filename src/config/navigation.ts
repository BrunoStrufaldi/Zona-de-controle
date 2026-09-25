import {
  Activity,
  ArrowLeftRight,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ChartPie,
  Cpu,
  CreditCard,
  Gamepad2,
  LayoutDashboard,
  ListChecks,
  NotebookPen,
  Repeat,
  Settings,
  Sparkles,
  Stethoscope,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { paths } from "@/app/router/paths";
import { type NavigationConfig } from "@/types/navigation";

/**
 * Configuração central da navegação. A sidebar e o breadcrumb são gerados a
 * partir daqui — para adicionar uma página, inclua-a em `paths`, aqui e nas rotas.
 */
export const navigation: NavigationConfig = {
  main: [
    {
      kind: "link",
      id: "dashboard",
      label: "Dashboard",
      path: paths.dashboard,
      icon: LayoutDashboard,
    },
    {
      kind: "group",
      id: "productivity",
      label: "Produtividade",
      icon: Target,
      items: [
        {
          kind: "link",
          id: "tasks",
          label: "Tarefas",
          path: paths.productivity.tasks,
          icon: ListChecks,
        },
        {
          kind: "link",
          id: "notes",
          label: "Notas",
          path: paths.productivity.notes,
          icon: NotebookPen,
        },
        {
          kind: "link",
          id: "routines",
          label: "Rotinas",
          path: paths.productivity.routines,
          icon: Repeat,
        },
        {
          kind: "link",
          id: "calendar",
          label: "Calendário",
          path: paths.productivity.calendar,
          icon: CalendarDays,
        },
      ],
    },
    {
      kind: "group",
      id: "system",
      label: "Sistema",
      icon: Cpu,
      items: [
        {
          kind: "link",
          id: "monitor",
          label: "Monitoramento",
          path: paths.system.monitor,
          icon: Activity,
        },
        {
          kind: "link",
          id: "devices",
          label: "Dispositivos",
          path: paths.system.devices,
          icon: Gamepad2,
        },
        {
          kind: "link",
          id: "diagnostics",
          label: "Diagnósticos",
          path: paths.system.diagnostics,
          icon: Stethoscope,
        },
        {
          kind: "link",
          id: "optimization",
          label: "Otimização",
          path: paths.system.optimization,
          icon: Sparkles,
        },
      ],
    },
    {
      kind: "group",
      id: "finance",
      label: "Finanças",
      icon: Wallet,
      items: [
        {
          kind: "link",
          id: "finance-overview",
          label: "Visão Geral",
          path: paths.finance.overview,
          icon: ChartPie,
        },
        {
          kind: "link",
          id: "transactions",
          label: "Lançamentos",
          path: paths.finance.transactions,
          icon: ArrowLeftRight,
        },
        {
          kind: "link",
          id: "recurring",
          label: "Recorrentes",
          path: paths.finance.recurring,
          icon: CalendarClock,
        },
        {
          kind: "link",
          id: "installments",
          label: "Parcelamentos",
          path: paths.finance.installments,
          icon: CreditCard,
        },
        {
          kind: "link",
          id: "investments",
          label: "Investimentos",
          path: paths.finance.investments,
          icon: TrendingUp,
        },
        {
          kind: "link",
          id: "analytics",
          label: "Analytics",
          path: paths.finance.analytics,
          icon: ChartColumn,
        },
      ],
    },
  ],
  footer: [
    {
      kind: "link",
      id: "settings",
      label: "Configurações",
      path: paths.settings,
      icon: Settings,
    },
  ],
};
