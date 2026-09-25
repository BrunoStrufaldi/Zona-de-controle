import { ListTree, ShieldCheck } from "lucide-react";

import { ResourceView } from "@/components/shared/resource-view";
import { Badge } from "@/components/ui/badge";
import { type BadgeVariantProps } from "@/components/ui/badge-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type CleanupCategoryDescriptor,
  type CleanupRisk,
} from "@/features/system/optimization/types";
import { type AsyncResource } from "@/hooks/use-async-resource";

const riskLabels: Record<CleanupRisk, string> = {
  low: "Risco baixo",
  medium: "Risco médio",
};

const riskVariants: Record<CleanupRisk, BadgeVariantProps["variant"]> = {
  low: "success",
  medium: "warning",
};

interface CleanupCategoriesCardProps {
  categories: AsyncResource<CleanupCategoryDescriptor[]>;
}

/** Categorias previstas, vindas do backend. Nenhuma ação de limpeza é oferecida. */
export function CleanupCategoriesCard({ categories }: CleanupCategoriesCardProps) {
  return (
    <Card className="animate-slide-up">
      <CardHeader>
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <ListTree className="size-4 text-primary" aria-hidden="true" />
            <CardTitle>Categorias previstas</CardTitle>
          </div>
          <CardDescription>
            Somente descrição. Nenhuma análise ou remoção é executada nesta versão.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ResourceView resource={categories} className="py-6">
          {(data) => (
            <ul className="grid gap-3">
              {data.map((category) => (
                <li
                  key={category.id}
                  className="grid gap-2 rounded-md border border-border bg-background/40 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{category.name}</span>
                    <Badge variant={riskVariants[category.risk]}>{riskLabels[category.risk]}</Badge>
                    {category.requiresConfirmation && (
                      <Badge variant="outline">
                        <ShieldCheck aria-hidden="true" />
                        Exige confirmação
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{category.description}</span>
                </li>
              ))}
            </ul>
          )}
        </ResourceView>
      </CardContent>
    </Card>
  );
}
