import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { productivityModules } from "@/features/productivity/module-info";

export function NotesPage() {
  return <ModulePlaceholder info={productivityModules.notes} />;
}
