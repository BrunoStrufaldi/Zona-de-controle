import { Monitor } from "lucide-react";
import { type ReactNode } from "react";

import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { type SystemInfo } from "@/features/system/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { formatBytes, formatDateTime } from "@/lib/format";

const NOT_AVAILABLE = "Não disponível";

interface SystemInfoCardProps {
  info: AsyncResource<SystemInfo>;
  className?: string;
}

export function SystemInfoCard({ info, className }: SystemInfoCardProps) {
  return (
    <WidgetCard title="Este computador" icon={Monitor} className={className}>
      <ResourceView resource={info} className="py-6">
        {(data) => (
          <dl className="grid gap-3 text-sm">
            <InfoRow label="Nome">{data.hostName ?? NOT_AVAILABLE}</InfoRow>
            <InfoRow label="Sistema">
              {data.osName ?? NOT_AVAILABLE}
              {data.osBuild && (
                <span className="text-muted-foreground"> · build {data.osBuild}</span>
              )}
            </InfoRow>
            <InfoRow label="Processador">{data.cpuBrand ?? NOT_AVAILABLE}</InfoRow>
            <InfoRow label="Núcleos">
              {data.physicalCores === null
                ? `${data.logicalCores} lógicos`
                : `${data.physicalCores} físicos · ${data.logicalCores} lógicos`}
            </InfoRow>
            <InfoRow label="Memória instalada">{formatBytes(data.totalMemoryBytes, 0)}</InfoRow>
            <InfoRow label="Arquitetura">{data.architecture}</InfoRow>
            <InfoRow label="Ligado desde">{formatDateTime(data.bootTimeSeconds * 1000)}</InfoRow>
            <InfoRow label="Temperatura">
              {NOT_AVAILABLE}
              <p className="mt-0.5 text-xs text-subtle-foreground">
                O Windows só libera os sensores para programas com privilégios de administrador, e o
                app não pede elevação.
              </p>
            </InfoRow>
          </dl>
        )}
      </ResourceView>
    </WidgetCard>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}
