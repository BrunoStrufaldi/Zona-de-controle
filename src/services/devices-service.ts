import {
  type BatteryProviderDescriptor,
  type DeviceBatteryInfo,
  type DeviceMarking,
  type UsbInputDevice,
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

/** Mouses, teclados e headsets USB conectados, com a classificação (somente leitura). */
export function listUsbInputDevices(): Promise<UsbInputDevice[]> {
  return invokeCommand("list_usb_input_devices");
}

/** Marca um dispositivo USB como sem fio (ou não) e o tipo dele. Auditado no Rust. */
export function setDeviceMarking(key: string, marking: DeviceMarking): Promise<UsbInputDevice[]> {
  return invokeCommand("set_device_marking", { key, marking });
}
