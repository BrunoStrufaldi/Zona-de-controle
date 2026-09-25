import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { financeModules } from "@/features/finance/module-info";

export function FinanceOverviewPage() {
  return <ModulePlaceholder info={financeModules.overview} />;
}
