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

export type ConnectionType = "bluetooth" | "usb" | "proprietary24Ghz" | "unknown";

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

export type ProviderStatus = "planned" | "available" | "unavailable";

export interface BatteryProviderDescriptor {
  id: BatteryProviderId;
  name: string;
  description: string;
  status: ProviderStatus;
}
