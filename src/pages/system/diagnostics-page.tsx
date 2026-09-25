import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { systemModules } from "@/features/system/module-info";

export function DiagnosticsPage() {
  return <ModulePlaceholder info={systemModules.diagnostics} />;
}
