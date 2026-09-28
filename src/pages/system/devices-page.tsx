import { Gamepad2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { BatteryProvidersCard } from "@/features/system/devices/components/battery-providers-card";
import { DeviceBatteryWidget } from "@/features/system/devices/components/device-battery-widget";
import { SupportLevelsCard } from "@/features/system/devices/components/support-levels-card";
import { UsbDevicesCard } from "@/features/system/devices/components/usb-devices-card";
import { deviceKindLabels } from "@/features/system/devices/domain/battery";
import { type DeviceMarking, type UsbInputDevice } from "@/features/system/devices/types";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { usePollingResource } from "@/hooks/use-polling-resource";
import {
  listBatteryDevices,
  listBatteryProviders,
  listUsbInputDevices,
  setDeviceMarking,
} from "@/services/devices-service";
import { toServiceError } from "@/services/tauri/errors";

/** Bateria muda devagar; 15 s também faz um dispositivo novo aparecer logo. */
const DEVICES_INTERVAL_MS = 15_000;

export function DevicesPage() {
  const batteries = usePollingResource(listBatteryDevices, { intervalMs: DEVICES_INTERVAL_MS });
  const usb = usePollingResource(listUsbInputDevices, { intervalMs: DEVICES_INTERVAL_MS });
  const providers = useAsyncResource(listBatteryProviders);

  const mark = async (device: UsbInputDevice, marking: DeviceMarking) => {
    try {
      await setDeviceMarking(device.key, marking);
      toast.success(marking.wireless ? "Marcado como sem fio" : "Marcado como com fio", {
        description: marking.wireless
          ? `“${device.name}” (${deviceKindLabels[marking.kind].toLowerCase()}) entrou na lista de bateria.`
          : `“${device.name}” saiu da lista de bateria.`,
      });
      usb.refresh();
      batteries.refresh();
    } catch (error) {
      toast.error("Não foi possível salvar", { description: toServiceError(error).message });
    }
  };

  return (
    <>
      <PageHeader
        title="Dispositivos"
        description="Periféricos sem fio e o nível de bateria de cada um, quando dá para ler. Nada é enviado aos dispositivos."
        icon={Gamepad2}
      />

      {/* Colunas pela largura da área de conteúdo (container query), não da janela. */}
      <div className="@container">
        <div className="grid gap-6 @3xl:grid-cols-2">
          <DeviceBatteryWidget devices={batteries} />
          <UsbDevicesCard
            devices={usb}
            onMark={(device, marking) => {
              void mark(device, marking);
            }}
          />
          <BatteryProvidersCard providers={providers} />
          <SupportLevelsCard />
        </div>
      </div>
    </>
  );
}
