import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { financeModules } from "@/features/finance/module-info";

export function RecurringPage() {
  return <ModulePlaceholder info={financeModules.recurring} />;
}
