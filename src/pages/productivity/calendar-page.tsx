import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { productivityModules } from "@/features/productivity/module-info";

export function CalendarPage() {
  return <ModulePlaceholder info={productivityModules.calendar} />;
}
