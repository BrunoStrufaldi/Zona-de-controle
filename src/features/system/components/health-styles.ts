import { type BadgeVariantProps } from "@/components/ui/badge-variants";
import { type ProgressTone } from "@/components/ui/progress";
import { type HealthStatus } from "@/features/system/types";

export const healthBadgeVariant: Record<HealthStatus, BadgeVariantProps["variant"]> = {
  healthy: "success",
  attention: "warning",
  critical: "danger",
};

export const healthProgressTone: Record<HealthStatus, ProgressTone> = {
  healthy: "primary",
  attention: "warning",
  critical: "danger",
};
