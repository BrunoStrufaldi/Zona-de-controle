import { ArrowRight, BatteryMedium } from "lucide-react";
import { Link } from "react-router";

import { paths } from "@/app/router/paths";
import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Button } from "@/components/ui/button";
import { DeviceBatteryRow } from "@/features/system/devices/components/device-battery-row";
import { type DeviceBatteryInfo } from "@/features/system/devices/types";
import { type AsyncResource } from "@/hooks/use-async-resource";

interface DeviceBatteryWidgetProps {
  devices: AsyncResource<DeviceBatteryInfo[]>;
  /** Link para a tela Dispositivos (no dashboard). */
  showLink?: boolean;
  className?: string;
}

/** Dispositivos sem fio e a bateria de cada um, com leitura real do sistema. */
export function DeviceBatteryWidget({
  devices,
  showLink = false,
  className,
}: DeviceBatteryWidgetProps) {
  return (
    <WidgetCard
      title="Bateria dos dispositivos"
      icon={BatteryMedium}
      className={className}
      headerExtra={
        showLink && (
          <Button asChild variant="ghost" size="sm" className="h-7 px-2">
            <Link to={paths.system.devices}>
              Dispositivos
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        )
      }
    >
      <ResourceView resource={devices} className="py-6">
        {(data) =>
          data.length === 0 ? (
            <EmptyState
              icon={BatteryMedium}
              title="Nenhum dispositivo sem fio encontrado"
              description="Receptores 2.4 GHz, controles Xbox e dispositivos Bluetooth aparecem aqui."
              className="border-0 py-6"
            />
          ) : (
            <ul className="grid gap-4" aria-label="Dispositivos com bateria">
              {data.map((device) => (
                <DeviceBatteryRow key={device.id} device={device} />
              ))}
            </ul>
          )
        }
      </ResourceView>
    </WidgetCard>
  );
}
