import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { financeModules } from "@/features/finance/module-info";

export function AnalyticsPage() {
  return <ModulePlaceholder info={financeModules.analytics} />;
}
