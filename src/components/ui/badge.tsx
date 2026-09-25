import { type ComponentProps } from "react";

import { badgeVariants, type BadgeVariantProps } from "@/components/ui/badge-variants";
import { cn } from "@/lib/cn";

export type BadgeProps = ComponentProps<"span"> & BadgeVariantProps;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
