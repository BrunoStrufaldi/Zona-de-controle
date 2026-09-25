import { RotateCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Algo deu errado",
  message,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex animate-fade-in flex-col items-center justify-center gap-3 rounded-lg border border-danger/25 bg-danger/5 px-6 py-10 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full border border-danger/30 bg-danger/10 text-danger">
        <TriangleAlert className="size-5" aria-hidden="true" />
      </div>
      <div className="grid max-w-md gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground" data-selectable>
          {message}
        </p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden="true" />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
