/**
 * DADOS FICTÍCIOS — usados apenas para demonstrar o layout do dashboard.
 *
 * Regras (ver CLAUDE.md):
 *  - Mocks vivem somente em `src/mocks/`.
 *  - Todo componente que exibir estes dados deve mostrar o selo "Demo".
 *  - Nunca apresente estes valores como métricas reais.
 */
import { type MonthlyCashflow } from "@/features/finance/types";
import { type RoutineProgressSummary } from "@/features/productivity/types";
import { type DeviceBatteryInfo } from "@/features/system/devices/types";
import { type StorageVolume, type SystemOverview } from "@/features/system/types";
import { type ActivityEntry } from "@/types/activity";

export interface DashboardDemoData {
  routine: RoutineProgressSummary;
  system: SystemOverview;
  storage: readonly StorageVolume[];
  devices: readonly DeviceBatteryInfo[];
  finance: { income: number; expenses: number };
  cashflow: readonly MonthlyCashflow[];
  activity: readonly ActivityEntry[];
}

const GIB = 1024 ** 3;

export const dashboardDemoData: DashboardDemoData = {
  routine: {
    name: "Rotina matinal",
    completedHabits: 4,
    totalHabits: 6,
    streakDays: 12,
  },
  system: {
    status: "healthy",
    usage: {
      cpuPercent: 23,
      memoryUsedBytes: 9.4 * GIB,
      memoryTotalBytes: 16 * GIB,
    },
    uptimeSeconds: 3 * 3600 + 42 * 60,
  },
  storage: [
    { mountPoint: "C:", label: "Sistema", usedBytes: 402 * GIB, totalBytes: 476 * GIB },
    { mountPoint: "D:", label: "Dados", usedBytes: 610 * GIB, totalBytes: 931 * GIB },
  ],
  devices: [
    {
      id: "demo-headset",
      name: "Headset sem fio",
      kind: "headset",
      connection: "bluetooth",
      provider: "bluetooth",
      support: "supported",
      level: { kind: "exact", percent: 78 },
      charging: "discharging",
      lastUpdated: "2026-09-25T09:12:00-03:00",
    },
    {
      id: "demo-controller",
      name: "Controle Xbox",
      kind: "controller",
      connection: "usb",
      provider: "xinput",
      support: "partial",
      level: { kind: "approximate", bucket: "medium" },
      charging: "charging",
      lastUpdated: "2026-09-25T09:10:00-03:00",
    },
    {
      id: "demo-mouse",
      name: "Mouse 2.4 GHz",
      kind: "mouse",
      connection: "proprietary24Ghz",
      provider: "hidVendor",
      support: "unsupported",
      level: { kind: "unknown" },
      charging: "unknown",
      lastUpdated: null,
    },
  ],
  finance: {
    income: 12_450,
    expenses: 8_730.9,
  },
  cashflow: [
    { month: "2026-04-01", income: 11_800, expenses: 9_120 },
    { month: "2026-05-01", income: 11_800, expenses: 8_640 },
    { month: "2026-06-01", income: 12_100, expenses: 9_870 },
    { month: "2026-07-01", income: 12_100, expenses: 8_310 },
    { month: "2026-08-01", income: 12_450, expenses: 9_020 },
    { month: "2026-09-01", income: 12_450, expenses: 8_730.9 },
  ],
  activity: [
    {
      id: "a1",
      module: "productivity",
      description: "Tarefa “Enviar relatório” concluída",
      occurredAt: "2026-09-25T08:45:00-03:00",
    },
    {
      id: "a2",
      module: "finance",
      description: "Lançamento “Internet” marcado como pago",
      occurredAt: "2026-09-24T19:20:00-03:00",
    },
    {
      id: "a3",
      module: "system",
      description: "Alerta: unidade C: acima de 80% de uso",
      occurredAt: "2026-09-24T14:05:00-03:00",
    },
    {
      id: "a4",
      module: "productivity",
      description: "Rotina matinal concluída",
      occurredAt: "2026-09-24T07:30:00-03:00",
    },
  ],
};
