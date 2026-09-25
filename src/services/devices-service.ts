import {
  type BatteryProviderDescriptor,
  type DeviceBatteryInfo,
} from "@/features/system/devices/types";
import { invokeCommand } from "@/services/tauri/commands";

/** Providers de bateria registrados no backend (somente leitura). */
export function listBatteryProviders(): Promise<BatteryProviderDescriptor[]> {
  return invokeCommand("list_battery_providers");
}

/** Dispositivos com leitura de bateria (somente leitura). */
export function listBatteryDevices(): Promise<DeviceBatteryInfo[]> {
  return invokeCommand("list_battery_devices");
}
