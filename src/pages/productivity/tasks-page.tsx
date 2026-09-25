import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { productivityModules } from "@/features/productivity/module-info";

export function TasksPage() {
  return <ModulePlaceholder info={productivityModules.tasks} />;
}
