import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { financeModules } from "@/features/finance/module-info";

export function InvestmentsPage() {
  return <ModulePlaceholder info={financeModules.investments} />;
}
