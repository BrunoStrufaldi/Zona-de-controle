import {
  type BatteryBucket,
  type ChargingState,
  type ConnectionType,
  type DeviceBatteryInfo,
  type DeviceKind,
  type SupportLevel,
} from "@/features/system/devices/types";
import { toIsoDate } from "@/lib/dates";
import { formatDayMonth, formatTime, toDate } from "@/lib/format";

export type BatteryTone = "success" | "warning" | "danger" | "muted";

export interface BatteryDisplay {
  /** Texto principal (ex.: "72%", "Médio (aprox.)", "Não disponível"). */
  label: string;
  /** Percentual para barra de progresso, ou `null` quando não há leitura. */
  percent: number | null;
  tone: BatteryTone;
  /** Por que não há um nível a mostrar (a tela exibe como dica), ou `null`. */
  explanation: string | null;
}

const UNAVAILABLE_EXPLANATION =
  "O app ainda não sabe ler a bateria deste dispositivo. O valor nunca é estimado.";
const OFF_EXPLANATION =
  "Último nível informado antes de desligar. Desligado, o dispositivo não informa a bateria.";
const WAITING_EXPLANATION =
  "O dispositivo informa a bateria quando é ligado, desligado ou conectado ao carregador. Faça uma dessas ações para atualizar.";

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
function clampPercent(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

export function describeBattery(
  device: Pick<DeviceBatteryInfo, "support" | "level">,
): BatteryDisplay {
  if (device.level.kind === "wired") {
    return { label: "Com fio", percent: null, tone: "muted", explanation: null };
  }
  if (device.level.kind === "off") {
    const { lastPercent } = device.level;
    // Sem barra: o último nível não é o atual.
    return lastPercent === null
      ? { label: "Desligado", percent: null, tone: "muted", explanation: null }
      : {
          label: `Desligado · ${clampPercent(lastPercent)}%`,
          percent: null,
          tone: "muted",
          explanation: OFF_EXPLANATION,
        };
  }
  if (device.level.kind === "waiting") {
    return {
      label: "Aguardando leitura",
      percent: null,
      tone: "muted",
      explanation: WAITING_EXPLANATION,
    };
  }
  if (device.support === "unsupported" || device.level.kind === "unknown") {
    return {
      label: "Não disponível",
      percent: null,
      tone: "muted",
      explanation: UNAVAILABLE_EXPLANATION,
    };
  }
  if (device.level.kind === "approximate") {
    const { bucket } = device.level;
    return {
      label: `${bucketLabels[bucket]} (aprox.)`,
      percent: bucketBarPercent[bucket],
      tone: bucketTones[bucket],
      explanation: null,
    };
  }
  const percent = clampPercent(device.level.percent);
  return { label: `${percent}%`, percent, tone: toneForPercent(percent), explanation: null };
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
  wireless: "Sem fio",
  unknown: "Desconhecida",
};

export const chargingLabels: Record<ChargingState, string> = {
  charging: "Carregando",
  discharging: "Na bateria",
  full: "Carregada",
  unknown: "Estado desconhecido",
};

/**
 * Linha secundária de um dispositivo: conexão, estado de carga (quando
 * conhecido) e a hora da última leitura. Sem leitura de um receptor 2.4 GHz, o
 * que se sabe é só que o receptor está conectado.
 */
export function deviceSubtitle(
  device: Pick<DeviceBatteryInfo, "connection" | "charging" | "lastUpdated">,
  now: Date = new Date(),
): string {
  const parts: string[] = [connectionLabels[device.connection]];
  if (device.charging !== "unknown") parts.push(chargingLabels[device.charging]);
  if (device.connection === "proprietary24Ghz" && device.lastUpdated === null) {
    parts.push("receptor USB conectado");
  }
  if (device.lastUpdated !== null) parts.push(lastReadLabel(device.lastUpdated, now));
  return parts.join(" · ");
}

/**
 * "lido às 14:05" ou, se a leitura não for de hoje, "lido em 27/09 às 14:05":
 * receptores só avisam a bateria em eventos, então a leitura pode ser antiga.
 */
function lastReadLabel(lastUpdated: string, now: Date): string {
  const readAt = toDate(lastUpdated);
  const time = formatTime(readAt);
  return toIsoDate(readAt) === toIsoDate(now)
    ? `lido às ${time}`
    : `lido em ${formatDayMonth(readAt)} às ${time}`;
}

export const deviceKindLabels: Record<DeviceKind, string> = {
  mouse: "Mouse",
  keyboard: "Teclado",
  headset: "Headset",
  controller: "Controle",
  other: "Outro",
};

/** Tipos oferecidos ao marcar um dispositivo USB como sem fio (sugerido primeiro). */
export function markingKindOptions(suggested: DeviceKind): DeviceKind[] {
  const kinds: DeviceKind[] = ["mouse", "keyboard", "headset", "other"];
  return [suggested, ...kinds.filter((kind) => kind !== suggested)];
}
