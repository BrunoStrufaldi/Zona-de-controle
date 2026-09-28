import { type BadgeVariantProps } from "@/components/ui/badge-variants";
import { type CleanupRunOutcome } from "@/features/system/optimization/types";

/** Cor do selo do resultado de uma limpeza (sempre acompanhado do rótulo). */
export const runOutcomeVariants: Record<CleanupRunOutcome, BadgeVariantProps["variant"]> = {
  completed: "success",
  cancelled: "warning",
  failed: "danger",
};
