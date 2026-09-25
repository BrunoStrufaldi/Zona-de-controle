import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { systemModules } from "@/features/system/module-info";

export function MonitorPage() {
  return <ModulePlaceholder info={systemModules.monitor} />;
}
