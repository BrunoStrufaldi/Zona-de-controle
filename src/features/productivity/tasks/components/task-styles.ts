import { type BadgeVariantProps } from "@/components/ui/badge-variants";
import { type DueState } from "@/features/productivity/tasks/domain/due";
import { type TaskPriority, type TaskStatus } from "@/features/productivity/tasks/types";

type BadgeVariant = BadgeVariantProps["variant"];

export const priorityBadgeVariant: Record<TaskPriority, BadgeVariant> = {
  low: "default",
  medium: "info",
  high: "warning",
  urgent: "danger",
};

export const statusBadgeVariant: Record<TaskStatus, BadgeVariant> = {
  todo: "outline",
  in_progress: "primary",
  done: "success",
};

export const dueBadgeVariant: Record<DueState, BadgeVariant> = {
  none: "outline",
  completed: "outline",
  overdue: "danger",
  today: "warning",
  soon: "info",
  later: "outline",
};
