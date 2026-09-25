import {
  BatteryCharging,
  CircleHelp,
  Gamepad2,
  Headphones,
  Keyboard,
  Mouse,
  Usb,
  type LucideIcon,
} from "lucide-react";

import { Progress, type ProgressTone } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type BatteryTone,
  chargingLabels,
  connectionLabels,
  describeBattery,
} from "@/features/system/devices/domain/battery";
import { type DeviceBatteryInfo, type DeviceKind } from "@/features/system/devices/types";
import { cn } from "@/lib/cn";

const kindIcons: Record<DeviceKind, LucideIcon> = {
  controller: Gamepad2,
  mouse: Mouse,
  keyboard: Keyboard,
  headset: Headphones,
  other: Usb,
};

const toneProgress: Record<Exclude<BatteryTone, "muted">, ProgressTone> = {
  success: "success",
  warning: "warning",
  danger: "danger",
};

interface DeviceBatteryRowProps {
  device: DeviceBatteryInfo;
}

export function DeviceBatteryRow({ device }: DeviceBatteryRowProps) {
  const display = describeBattery(device);
  const KindIcon = kindIcons[device.kind];
  const isCharging = device.charging === "charging";

  return (
    <li className="flex items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-raised text-muted-foreground">
        <KindIcon className="size-4" aria-hidden="true" />
      </div>
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate">{device.name}</span>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 font-mono text-xs tabular",
              display.tone === "muted" ? "text-subtle-foreground" : "text-foreground",
            )}
          >
            {isCharging && (
              <BatteryCharging className="size-3.5 text-success" aria-label="Carregando" />
            )}
            {display.label}
            {display.percent === null && (
              <Tooltip>
                <TooltipTrigger
                  className="cursor-help"
                  aria-label="Por que a bateria não está disponível?"
                >
                  <CircleHelp className="size-3.5" aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent className="max-w-60">
                  Este dispositivo não expõe o nível de bateria por uma API suportada. O valor não é
                  estimado.
                </TooltipContent>
              </Tooltip>
            )}
          </span>
        </div>
        {display.percent !== null && display.tone !== "muted" ? (
          <Progress
            value={display.percent}
            tone={toneProgress[display.tone]}
            aria-label={`Bateria de ${device.name}`}
          />
        ) : (
          <div
            aria-hidden="true"
            className="h-1.5 rounded-full border border-dashed border-border"
          />
        )}
        <span className="text-xs text-subtle-foreground">
          {connectionLabels[device.connection]} · {chargingLabels[device.charging]}
        </span>
      </div>
    </li>
  );
}
