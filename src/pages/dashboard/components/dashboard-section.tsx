import { ArrowRight, type LucideIcon } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

interface DashboardSectionProps {
  title: string;
  icon: LucideIcon;
  /** Link para o módulo (ex.: "Abrir Finanças"). */
  link?: { label: string; to: string };
  children: ReactNode;
}

/** Grupo de cards do dashboard sob um título. As colunas seguem a largura do conteúdo. */
export function DashboardSection({ title, icon: Icon, link, children }: DashboardSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="@container grid gap-4">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
        <h2 id={headingId} className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Icon className="size-5 text-primary" aria-hidden="true" />
          {title}
        </h2>
        {link && (
          <Button asChild variant="ghost" size="sm" className="h-7 px-2">
            <Link to={link.to}>
              {link.label}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        )}
      </div>
      <div className="grid gap-6 @3xl:grid-cols-2 @6xl:grid-cols-3">{children}</div>
    </section>
  );
}
