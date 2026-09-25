import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { systemModules } from "@/features/system/module-info";
import { SafetyRulesCard } from "@/features/system/optimization/components/safety-rules-card";

export function OptimizationPage() {
  return (
    <ModulePlaceholder info={systemModules.optimization}>
      <SafetyRulesCard />
    </ModulePlaceholder>
  );
}
