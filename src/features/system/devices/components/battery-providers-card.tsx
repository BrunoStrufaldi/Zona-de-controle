import { Plug } from "lucide-react";

import { ResourceView } from "@/components/shared/resource-view";
import { Badge } from "@/components/ui/badge";
import { type BadgeVariantProps } from "@/components/ui/badge-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type BatteryProviderDescriptor,
  type ProviderStatus,
} from "@/features/system/devices/types";
import { type AsyncResource } from "@/hooks/use-async-resource";

const statusLabels: Record<ProviderStatus, string> = {
  planned: "Planejado",
  available: "Disponível",
  unavailable: "Indisponível",
};

const statusVariants: Record<ProviderStatus, BadgeVariantProps["variant"]> = {
  planned: "warning",
  available: "success",
  unavailable: "default",
};

interface BatteryProvidersCardProps {
  providers: AsyncResource<BatteryProviderDescriptor[]>;
}

/** Providers registrados no backend Rust (dados reais, não demonstrativos). */
export function BatteryProvidersCard({ providers }: BatteryProvidersCardProps) {
  return (
    <Card className="animate-slide-up">
      <CardHeader>
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <Plug className="size-4 text-primary" aria-hidden="true" />
            <CardTitle>Fontes de leitura</CardTitle>
          </div>
          <CardDescription>
            Providers registrados no backend. Todos somente leitura.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ResourceView resource={providers} className="py-6">
          {(data) => (
            <ul className="grid gap-3">
              {data.map((provider) => (
                <li
                  key={provider.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-border bg-background/40 p-3"
                >
                  <div className="grid gap-0.5">
                    <span className="text-sm font-medium">{provider.name}</span>
                    <span className="text-xs text-muted-foreground">{provider.description}</span>
                  </div>
                  <Badge variant={statusVariants[provider.status]}>
                    {statusLabels[provider.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </ResourceView>
      </CardContent>
    </Card>
  );
}
