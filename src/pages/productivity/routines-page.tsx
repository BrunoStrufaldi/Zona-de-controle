import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { productivityModules } from "@/features/productivity/module-info";

export function RoutinesPage() {
  return <ModulePlaceholder info={productivityModules.routines} />;
}
