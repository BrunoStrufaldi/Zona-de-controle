import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { DeviceBatteryWidget } from "@/features/system/devices/components/device-battery-widget";
import { SupportLevelsCard } from "@/features/system/devices/components/support-levels-card";
import { systemModules } from "@/features/system/module-info";
import { dashboardDemoData } from "@/mocks/dashboard";

export function DevicesPage() {
  return (
    <ModulePlaceholder info={systemModules.devices}>
      <div className="grid gap-6 lg:grid-cols-2">
        <SupportLevelsCard />
        <DeviceBatteryWidget title="Exemplo de exibição" devices={dashboardDemoData.devices} demo />
      </div>
    </ModulePlaceholder>
  );
}
