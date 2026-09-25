import {
  type BatteryBucket,
  type ChargingState,
  type ConnectionType,
  type DeviceBatteryInfo,
  type SupportLevel,
} from "@/features/system/devices/types";

export type BatteryTone = "success" | "warning" | "danger" | "muted";

export interface BatteryDisplay {
  /** Texto principal (ex.: "72%", "Médio (aprox.)", "Não disponível"). */
  label: string;
  /** Percentual para barra de progresso, ou `null` quando não há leitura. */
  percent: number | null;
  tone: BatteryTone;
}

const LOW_BATTERY_THRESHOLD = 20;
const MEDIUM_BATTERY_THRESHOLD = 50;

const bucketLabels: Record<BatteryBucket, string> = {
  empty: "Vazia",
  low: "Baixa",
  medium: "Média",
  full: "Cheia",
};

/** Posição representativa de cada faixa, usada apenas para desenhar a barra. */
const bucketBarPercent: Record<BatteryBucket, number> = {
  empty: 5,
  low: 25,
  medium: 60,
  full: 100,
};

const bucketTones: Record<BatteryBucket, BatteryTone> = {
  empty: "danger",
  low: "danger",
  medium: "warning",
  full: "success",
};

function toneForPercent(percent: number): BatteryTone {
  if (percent <= LOW_BATTERY_THRESHOLD) return "danger";
  if (percent <= MEDIUM_BATTERY_THRESHOLD) return "warning";
  return "success";
}

/**
 * Converte a leitura de bateria em dados de exibição. Dispositivos sem suporte
 * ou sem leitura retornam "Não disponível" — nunca um valor inventado.
 */
export function describeBattery(
  device: Pick<DeviceBatteryInfo, "support" | "level">,
): BatteryDisplay {
  if (device.support === "unsupported" || device.level.kind === "unknown") {
    return { label: "Não disponível", percent: null, tone: "muted" };
  }
  if (device.level.kind === "approximate") {
    const { bucket } = device.level;
    return {
      label: `${bucketLabels[bucket]} (aprox.)`,
      percent: bucketBarPercent[bucket],
      tone: bucketTones[bucket],
    };
  }
  const percent = Math.round(Math.min(100, Math.max(0, device.level.percent)));
  return { label: `${percent}%`, percent, tone: toneForPercent(percent) };
}

export const supportLevelLabels: Record<SupportLevel, string> = {
  supported: "Suportado",
  partial: "Parcial",
  unsupported: "Não suportado",
};

export const connectionLabels: Record<ConnectionType, string> = {
  bluetooth: "Bluetooth",
  usb: "USB",
  proprietary24Ghz: "2.4 GHz",
  unknown: "Desconhecida",
};

export const chargingLabels: Record<ChargingState, string> = {
  charging: "Carregando",
  discharging: "Em uso",
  full: "Carregada",
  unknown: "Estado desconhecido",
};
