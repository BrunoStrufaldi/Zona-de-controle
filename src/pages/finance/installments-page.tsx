import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { financeModules } from "@/features/finance/module-info";

export function InstallmentsPage() {
  return <ModulePlaceholder info={financeModules.installments} />;
}
