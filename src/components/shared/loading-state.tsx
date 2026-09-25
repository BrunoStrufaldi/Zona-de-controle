import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/cn";

interface LoadingStateProps {
  label?: string;
  className?: string;
}

export function LoadingState({ label = "Carregando…", className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex animate-fade-in items-center justify-center gap-3 px-6 py-12 text-sm text-muted-foreground",
        className,
      )}
    >
      <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
