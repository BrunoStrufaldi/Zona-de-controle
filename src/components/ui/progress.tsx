import { Progress as ProgressPrimitive } from "radix-ui";
import { type ComponentProps } from "react";

import { cn } from "@/lib/cn";

export type ProgressTone = "primary" | "success" | "warning" | "danger";

const toneClasses: Record<ProgressTone, string> = {
  primary: "bg-primary shadow-glow-sm",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

interface ProgressProps extends Omit<ComponentProps<typeof ProgressPrimitive.Root>, "value"> {
  /** Valor entre 0 e 100. */
  value: number;
  tone?: ProgressTone;
}

export function Progress({ className, value, tone = "primary", ...props }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={clamped}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-raised", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full w-full flex-1 rounded-full transition-transform duration-500 ease-out-expo",
          toneClasses[tone],
        )}
        style={{ transform: `translateX(-${100 - clamped}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
