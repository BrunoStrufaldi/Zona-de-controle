import { type ComponentProps } from "react";

import { cn } from "@/lib/cn";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full resize-y rounded-md border border-input bg-background/60 px-3 py-2 text-sm text-foreground",
        "transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-subtle-foreground",
        "focus-visible:border-primary/70 focus-visible:shadow-glow-sm focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}
