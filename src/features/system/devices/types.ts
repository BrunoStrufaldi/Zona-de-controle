import { type IsoDateTime } from "@/types/common";

/**
 * Contrato de dispositivos e bateria. Espelha `src-tauri/src/domain/devices`.
 *
 * No Windows não há uma API única para bateria de periféricos; cada fonte é um
 * provider independente, e cada dispositivo informa o quanto ele é suportado.
 */

export type BatteryProviderId = "bluetooth" | "xinput" | "hidVendor";

/** Quanto o app consegue ler deste dispositivo. */
export type SupportLevel = "supported" | "partial" | "unsupported";

/** `wireless`: sem fio, mas sem saber a tecnologia (ex.: controle Xbox via XInput). */
export type ConnectionType = "bluetooth" | "usb" | "proprietary24Ghz" | "wireless" | "unknown";

export type DeviceKind = "controller" | "mouse" | "keyboard" | "headset" | "other";

export type ChargingState = "charging" | "discharging" | "full" | "unknown";

/** Faixas de bateria reportadas por APIs que não fornecem percentual exato (ex.: XInput). */
export type BatteryBucket = "empty" | "low" | "medium" | "full";

/**
 * Nível de bateria. `unknown` deve ser exibido como "não disponível" —
 * nunca invente um valor.
 */
export type BatteryLevel =
  | { kind: "exact"; percent: number }
  | { kind: "approximate"; bucket: BatteryBucket }
  /** Alimentado pelo cabo: não há bateria a mostrar. */
  | { kind: "wired" }
  /** O leitor do modelo existe, mas o dispositivo ainda não informou. */
  | { kind: "waiting" }
  /**
   * Último nível registrado antes (app fechado ou receptor reconectado), ainda
   * sem aviso novo. Nunca é o nível atual.
   */
  | { kind: "lastKnown"; percent: number }
  /**
   * O dispositivo informou que está desligado. `lastPercent` é o último nível
   * informado com ele ligado (não é o nível atual).
   */
  | { kind: "off"; lastPercent: number | null }
  | { kind: "unknown" };

export interface DeviceBatteryInfo {
  id: string;
  name: string;
  kind: DeviceKind;
  connection: ConnectionType;
  provider: BatteryProviderId;
  support: SupportLevel;
  level: BatteryLevel;
  charging: ChargingState;
  lastUpdated: IsoDateTime | null;
}

/** `partial`: funciona em parte (ex.: detecta o dispositivo, mas não lê a bateria). */
export type ProviderStatus = "planned" | "available" | "partial" | "unavailable";

export interface BatteryProviderDescriptor {
  id: BatteryProviderId;
  name: string;
  description: string;
  status: ProviderStatus;
}

/** Escolha do usuário para um dispositivo USB (gravada e auditada no Rust). */
export interface DeviceMarking {
  wireless: boolean;
  kind: DeviceKind;
}

/**
 * Mouse, teclado ou headset USB conectado agora. Pela USB não dá para saber se
 * é sem fio (receptor 2.4 GHz) ou com fio: o usuário marca uma vez, e modelos
 * conhecidos já vêm reconhecidos.
 */
export interface UsbInputDevice {
  /** `vid:pid` em hexadecimal minúsculo (ex.: "24ae:1416"). */
  key: string;
  name: string;
  /** Nome informado pelo receptor/dispositivo (ex.: "Rapoo Gaming Device"). */
  productName: string;
  kind: DeviceKind;
  /** Tipo sugerido pelas interfaces e pelo nome (usado ao marcar). */
  suggestedKind: DeviceKind;
  /** Tratado como sem fio (entra na lista de bateria). */
  wireless: boolean;
  /** Modelo conhecido pelo app. */
  known: boolean;
  /** O usuário mudou o padrão para este dispositivo. */
  marked: boolean;
}
