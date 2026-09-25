import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { BatteryProvidersCard } from "@/features/system/devices/components/battery-providers-card";
import { DeviceBatteryWidget } from "@/features/system/devices/components/device-battery-widget";
import { SupportLevelsCard } from "@/features/system/devices/components/support-levels-card";
import { systemModules } from "@/features/system/module-info";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { dashboardDemoData } from "@/mocks/dashboard";
import { listBatteryProviders } from "@/services/devices-service";

export function DevicesPage() {
  const providers = useAsyncResource(listBatteryProviders);

  return (
    <ModulePlaceholder info={systemModules.devices}>
      <div className="grid gap-6 lg:grid-cols-2">
        <BatteryProvidersCard providers={providers} />
        <SupportLevelsCard />
        <DeviceBatteryWidget title="Exemplo de exibição" devices={dashboardDemoData.devices} demo />
      </div>
    </ModulePlaceholder>
  );
}
