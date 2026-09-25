import { CircleDashed, Construction } from "lucide-react";
import { type ReactNode } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveNavItem } from "@/hooks/use-active-nav-item";
import { type ModuleInfo } from "@/types/module";

interface ModulePlaceholderProps {
  info: ModuleInfo;
  /** Seções adicionais exibidas abaixo do placeholder. */
  children?: ReactNode;
}

/**
 * Página padrão de um módulo ainda não implementado. Título e ícone vêm da
 * configuração de navegação, garantindo consistência com a sidebar.
 */
export function ModulePlaceholder({ info, children }: ModulePlaceholderProps) {
  const navItem = useActiveNavItem();

  return (
    <>
      <PageHeader
        title={navItem?.label ?? "Módulo"}
        description={info.description}
        icon={navItem?.icon}
        badges={
          <>
            <Badge variant="primary">Fase {info.phase}</Badge>
            <Badge>Em construção</Badge>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="animate-slide-up lg:col-span-2">
          <CardHeader>
            <CardTitle>Planejado para este módulo</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 sm:grid-cols-2">
              {info.plannedFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm">
                  <CircleDashed
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <EmptyState
          icon={Construction}
          title="Nada por aqui ainda"
          description={`Este módulo será implementado na Fase ${info.phase} do roadmap. Nenhum dado é exibido até lá.`}
          className="animate-slide-up bg-card/40"
        />
      </div>

      {children}
    </>
  );
}
