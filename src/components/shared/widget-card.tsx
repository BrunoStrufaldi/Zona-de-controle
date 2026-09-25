import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

import { DemoBadge } from "@/components/shared/demo-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";

interface WidgetCardProps {
  title: string;
  icon?: LucideIcon;
  /** Marca o card como contendo dados fictícios (exibe o selo "Demo"). */
  demo?: boolean;
  /** Conteúdo extra no cabeçalho, antes do selo "Demo". */
  headerExtra?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

/** Card padrão dos widgets de dashboard: título, ícone e selo de demonstração. */
export function WidgetCard({
  title,
  icon: Icon,
  demo = false,
  headerExtra,
  children,
  className,
  contentClassName,
}: WidgetCardProps) {
  return (
    <Card interactive className={cn("min-w-0 animate-slide-up", className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-4 text-primary" aria-hidden="true" />}
          <CardTitle>{title}</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          {demo && <DemoBadge />}
        </div>
      </CardHeader>
      <CardContent className={cn("flex flex-1 flex-col", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
