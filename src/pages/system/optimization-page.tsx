import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { systemModules } from "@/features/system/module-info";
import { CleanupCategoriesCard } from "@/features/system/optimization/components/cleanup-categories-card";
import { SafetyRulesCard } from "@/features/system/optimization/components/safety-rules-card";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { listCleanupCategories } from "@/services/optimization-service";

export function OptimizationPage() {
  const categories = useAsyncResource(listCleanupCategories);

  return (
    <ModulePlaceholder info={systemModules.optimization}>
      <div className="grid gap-6 lg:grid-cols-2">
        <CleanupCategoriesCard categories={categories} />
        <SafetyRulesCard />
      </div>
    </ModulePlaceholder>
  );
}
