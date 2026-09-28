import { vi } from "vitest";

import {
  type BatteryProviderDescriptor,
  type DeviceBatteryInfo,
  type DeviceMarking,
  type UsbInputDevice,
} from "@/features/system/devices/types";
import { mockDesktopRuntime } from "@/test/tauri";

/** Dispositivos USB como no PC do usuário: dois receptores conhecidos e um teclado com fio. */
const USB_DEVICES: UsbInputDevice[] = [
  {
    key: "291d:385d",
    name: "MCHOSE V9 PRO",
    productName: "MCHOSE V9 PRO",
    kind: "headset",
    suggestedKind: "headset",
    wireless: true,
    known: true,
    marked: false,
  },
  {
    key: "24ae:1416",
    name: "Rapoo VT7 Max",
    productName: "Rapoo Gaming Device",
    kind: "mouse",
    suggestedKind: "mouse",
    wireless: true,
    known: true,
    marked: false,
  },
  {
    key: "3151:502d",
    name: "Akko Keyboard",
    productName: "Akko Keyboard",
    kind: "keyboard",
    suggestedKind: "keyboard",
    wireless: false,
    known: false,
    marked: false,
  },
];

const OTHER_BATTERIES: DeviceBatteryInfo[] = [
  {
    id: "xinput:0",
    name: "Controle Xbox (jogador 1)",
    kind: "controller",
    connection: "wireless",
    provider: "xinput",
    support: "partial",
    level: { kind: "approximate", bucket: "medium" },
    charging: "unknown",
    lastUpdated: "2026-09-28T12:00:00Z",
  },
  {
    id: "bt:fone",
    name: "Fone Bluetooth",
    kind: "headset",
    connection: "bluetooth",
    provider: "bluetooth",
    support: "supported",
    level: { kind: "exact", percent: 80 },
    charging: "unknown",
    lastUpdated: "2026-09-28T12:00:00Z",
  },
];

const PROVIDERS: BatteryProviderDescriptor[] = [
  {
    id: "hidVendor",
    name: "Receptores 2.4 GHz",
    description: "Detecta o receptor USB.",
    status: "partial",
  },
];

/** Receptores com leitor de bateria (como no Rust: headset MCHOSE e mouse Rapoo). */
const HEADSET_KEY = "291d:385d";
const MOUSE_KEY = "24ae:1416";
const KEYS_WITH_READER = new Set([HEADSET_KEY, MOUSE_KEY]);

interface ModelReading {
  level: DeviceBatteryInfo["level"];
  charging: DeviceBatteryInfo["charging"];
  lastUpdated: string;
}

/**
 * Backend de dispositivos para testes de interface. Aplica as marcações como o
 * Rust (a marcação prevalece; sem fio entra na lista de bateria). O headset e o
 * mouse têm leitor: sem `headset`/`mouse`, ficam "aguardando leitura".
 */
export function mockDevicesBackend({
  others = OTHER_BATTERIES,
  headset,
  mouse,
}: { others?: DeviceBatteryInfo[]; headset?: ModelReading; mouse?: ModelReading } = {}) {
  const readings: Record<string, ModelReading | undefined> = {
    [HEADSET_KEY]: headset,
    [MOUSE_KEY]: mouse,
  };
  let usb = USB_DEVICES.map((device) => ({ ...device }));

  const batteries = (): DeviceBatteryInfo[] => [
    ...usb
      .filter((device) => device.wireless)
      .map((device): DeviceBatteryInfo => {
        const base: DeviceBatteryInfo = {
          id: `usb:${device.key}`,
          name: device.name,
          kind: device.kind,
          connection: "proprietary24Ghz",
          provider: "hidVendor",
          support: "unsupported",
          level: { kind: "unknown" },
          charging: "unknown",
          lastUpdated: null,
        };
        if (!KEYS_WITH_READER.has(device.key)) return base;
        const reading = readings[device.key];
        return reading
          ? { ...base, support: "supported", ...reading }
          : { ...base, support: "supported", level: { kind: "waiting" } };
      }),
    ...others,
  ];

  const handlers = {
    list_battery_providers: vi.fn(() => PROVIDERS),
    list_battery_devices: vi.fn(batteries),
    list_usb_input_devices: vi.fn(() => usb),
    set_device_marking: vi.fn((args: { key: string; marking: DeviceMarking }) => {
      usb = usb.map((device) =>
        device.key === args.key ? { ...device, ...args.marking, marked: true } : device,
      );
      return usb;
    }),
  };
  mockDesktopRuntime(handlers);
  return { handlers };
}
