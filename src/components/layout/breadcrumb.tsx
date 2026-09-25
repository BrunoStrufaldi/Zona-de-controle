import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/cn";

interface BreadcrumbProps {
  trail: readonly string[];
  className?: string;
}

export function Breadcrumb({ trail, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Você está em" className={cn("min-w-0", className)}>
      <ol className="flex items-center gap-1.5 text-sm">
        {trail.map((label, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li
              key={`${label}-${index}`}
              aria-current={isLast ? "page" : undefined}
              className={cn(
                "flex min-w-0 items-center gap-1.5",
                isLast ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {index > 0 && (
                <ChevronRight
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-subtle-foreground"
                />
              )}
              <span className="truncate">{label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
