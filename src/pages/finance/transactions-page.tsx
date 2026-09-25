import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { financeModules } from "@/features/finance/module-info";

export function TransactionsPage() {
  return <ModulePlaceholder info={financeModules.transactions} />;
}
