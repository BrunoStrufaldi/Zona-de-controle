import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

import { cn } from "@/lib/cn";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Selos ao lado do título (ex.: fase do roadmap). */
  badges?: ReactNode;
  /** Ações da página, alinhadas à direita. */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  badges,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
        "animate-slide-up",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        {Icon && (
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary shadow-glow-sm">
            <Icon className="size-5" aria-hidden="true" />
          </div>
        )}
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {badges}
          </div>
          {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
