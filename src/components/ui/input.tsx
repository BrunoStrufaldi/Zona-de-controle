import { type ComponentProps } from "react";

import { cn } from "@/lib/cn";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-input bg-background/60 px-3 text-sm text-foreground",
        "transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-subtle-foreground",
        "focus-visible:border-primary/70 focus-visible:shadow-glow-sm focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}
