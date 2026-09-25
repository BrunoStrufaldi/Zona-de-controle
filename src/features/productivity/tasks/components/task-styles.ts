import { type BadgeVariantProps } from "@/components/ui/badge-variants";
import { type DueState } from "@/features/productivity/tasks/domain/due";
import {
  type CategoryColor,
  type TaskPriority,
  type TaskStatus,
} from "@/features/productivity/tasks/types";

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

/** Classes por cor de categoria (literais, para o Tailwind gerar os utilitários). */
export const categoryDotClass: Record<CategoryColor, string> = {
  red: "bg-category-red",
  orange: "bg-category-orange",
  amber: "bg-category-amber",
  green: "bg-category-green",
  teal: "bg-category-teal",
  blue: "bg-category-blue",
  violet: "bg-category-violet",
  pink: "bg-category-pink",
  slate: "bg-category-slate",
};

export const categoryBadgeClass: Record<CategoryColor, string> = {
  red: "border-category-red/35 bg-category-red/10 text-category-red",
  orange: "border-category-orange/35 bg-category-orange/10 text-category-orange",
  amber: "border-category-amber/35 bg-category-amber/10 text-category-amber",
  green: "border-category-green/35 bg-category-green/10 text-category-green",
  teal: "border-category-teal/35 bg-category-teal/10 text-category-teal",
  blue: "border-category-blue/35 bg-category-blue/10 text-category-blue",
  violet: "border-category-violet/35 bg-category-violet/10 text-category-violet",
  pink: "border-category-pink/35 bg-category-pink/10 text-category-pink",
  slate: "border-category-slate/35 bg-category-slate/10 text-category-slate",
};
