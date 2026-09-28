import { Check, MoreHorizontal, Unplug, Usb } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deviceKindLabels, markingKindOptions } from "@/features/system/devices/domain/battery";
import { type DeviceMarking, type UsbInputDevice } from "@/features/system/devices/types";
import { type AsyncResource } from "@/hooks/use-async-resource";

interface UsbDevicesCardProps {
  devices: AsyncResource<UsbInputDevice[]>;
  onMark: (device: UsbInputDevice, marking: DeviceMarking) => void;
  className?: string;
}

/**
 * Mouses, teclados e headsets USB conectados. Pela USB não dá para saber se um
 * dispositivo é sem fio: o usuário marca uma vez (modelos conhecidos já vêm
 * reconhecidos). Só grava a escolha; nada é enviado ao dispositivo.
 */
export function UsbDevicesCard({ devices, onMark, className }: UsbDevicesCardProps) {
  return (
    <WidgetCard title="Dispositivos USB" icon={Usb} className={className} contentClassName="gap-4">
      <p className="text-sm text-muted-foreground">
        Pela USB, um receptor sem fio e um aparelho com fio parecem iguais. Marque os que são sem
        fio para eles entrarem na lista de bateria.
      </p>
      <ResourceView resource={devices} className="py-6">
        {(data) =>
          data.length === 0 ? (
            <EmptyState
              icon={Unplug}
              title="Nenhum mouse, teclado ou headset USB conectado"
              className="border-0 py-6"
            />
          ) : (
            <ul className="grid gap-3" aria-label="Dispositivos USB conectados">
              {data.map((device) => (
                <UsbDeviceRow key={device.key} device={device} onMark={onMark} />
              ))}
            </ul>
          )
        }
      </ResourceView>
    </WidgetCard>
  );
}

interface UsbDeviceRowProps {
  device: UsbInputDevice;
  onMark: (device: UsbInputDevice, marking: DeviceMarking) => void;
}

function UsbDeviceRow({ device, onMark }: UsbDeviceRowProps) {
  const showProductName = device.productName !== device.name;

  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-border bg-background/40 p-3">
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium break-words">{device.name}</span>
          <Badge variant={device.wireless ? "success" : "default"}>
            {device.wireless ? "Sem fio" : "Com fio"}
          </Badge>
          {device.known && !device.marked && <Badge variant="info">Reconhecido</Badge>}
          {device.marked && <Badge variant="outline">Marcado por você</Badge>}
        </div>
        <span className="text-xs text-subtle-foreground">
          {deviceKindLabels[device.kind]}
          {showProductName && ` · informa “${device.productName}”`} ·{" "}
          <span className="font-mono">{device.key}</span>
        </span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Ações de “${device.name}”`}
            className="shrink-0"
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{device.wireless ? "Tipo" : "Marcar como sem fio"}</DropdownMenuLabel>
          {markingKindOptions(device.wireless ? device.kind : device.suggestedKind).map((kind) => {
            const current = device.wireless && kind === device.kind;
            return (
              <DropdownMenuItem
                key={kind}
                disabled={current}
                onSelect={() => {
                  onMark(device, { wireless: true, kind });
                }}
              >
                {current ? <Check aria-hidden="true" /> : <span className="size-4" />}
                {deviceKindLabels[kind]}
                {!device.wireless && kind === device.suggestedKind && (
                  <span className="text-xs text-muted-foreground">(sugerido)</span>
                )}
              </DropdownMenuItem>
            );
          })}
          {device.wireless && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  onMark(device, { wireless: false, kind: device.kind });
                }}
              >
                <Unplug aria-hidden="true" />
                Não é sem fio
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
