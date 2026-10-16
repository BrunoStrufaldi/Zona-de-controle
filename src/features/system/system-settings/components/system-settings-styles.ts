import { type BadgeVariantProps } from "@/components/ui/badge-variants";
import { type FindingLevel } from "@/features/system/system-settings/types";

export const levelBadgeVariant: Record<FindingLevel, BadgeVariantProps["variant"]> = {
  suggestion: "info",
  attention: "warning",
  critical: "danger",
};
