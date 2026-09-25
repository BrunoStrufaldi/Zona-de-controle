import { BatteryMedium } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { WidgetCard } from "@/components/shared/widget-card";
import { DeviceBatteryRow } from "@/features/system/devices/components/device-battery-row";
import { type DeviceBatteryInfo } from "@/features/system/devices/types";

interface DeviceBatteryWidgetProps {
  devices: readonly DeviceBatteryInfo[];
  demo?: boolean;
  title?: string;
}

export function DeviceBatteryWidget({
  devices,
  demo = false,
  title = "Bateria dos dispositivos",
}: DeviceBatteryWidgetProps) {
  return (
    <WidgetCard title={title} icon={BatteryMedium} demo={demo}>
      {devices.length === 0 ? (
        <EmptyState
          title="Nenhum dispositivo encontrado"
          description="Periféricos compatíveis aparecerão aqui."
          className="py-8"
        />
      ) : (
        <ul className="grid gap-4">
          {devices.map((device) => (
            <DeviceBatteryRow key={device.id} device={device} />
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
