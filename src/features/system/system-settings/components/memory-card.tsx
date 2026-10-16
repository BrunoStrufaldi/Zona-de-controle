import { MemoryStick } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import {
  StatusList,
  type StatusRow,
} from "@/features/system/system-settings/components/status-list";
import {
  formatMicrocode,
  formatSpeed,
  memoryKindLabels,
} from "@/features/system/system-settings/domain/hardware";
import { NOT_AVAILABLE } from "@/features/system/system-settings/domain/settings";
import { type HardwareReport, type MemoryModule } from "@/features/system/system-settings/types";
import { formatBytes } from "@/lib/format";

function speedLabel(mts: number | null): string {
  return mts === null ? NOT_AVAILABLE : formatSpeed(mts);
}

function ModuleRow({ module }: { module: MemoryModule }) {
  const description = [
    module.sizeBytes !== null && formatBytes(module.sizeBytes, 0),
    module.kind && memoryKindLabels[module.kind],
    module.manufacturer,
    module.partNumber,
  ].filter(Boolean);
  return (
    <li className="grid gap-1 border-b border-border pb-3 last:border-0 last:pb-0">
      <span className="font-medium break-all">{module.locator ?? "Módulo"}</span>
      <span className="text-xs break-all text-muted-foreground">
        {description.length > 0 ? description.join(" · ") : NOT_AVAILABLE}
      </span>
      <span className="font-mono text-xs text-muted-foreground tabular">
        Configurada: {speedLabel(module.configuredSpeedMts)} · informada pelo módulo:{" "}
        {speedLabel(module.maxSpeedMts)}
      </span>
    </li>
  );
}

/** Processador e módulos de memória. */
export function MemoryCard({ report }: { report: HardwareReport }) {
  const { cpu } = report;
  const rows: StatusRow[] = [{ label: "Processador", value: cpu.name ?? NOT_AVAILABLE }];
  if (cpu.microcode !== null) {
    rows.push({ label: "Microcódigo", value: formatMicrocode(cpu.microcode) });
  }
  return (
    <WidgetCard title="Processador e memória" icon={MemoryStick} contentClassName="gap-4">
      <StatusList label="Leituras do processador" rows={rows} />
      <div className="grid gap-2 border-t border-border pt-3">
        <span className="text-xs font-medium text-muted-foreground">Memória</span>
        {!report.smbiosAvailable ? (
          <p className="text-sm text-muted-foreground">{NOT_AVAILABLE}.</p>
        ) : report.memoryModules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum módulo informado pela placa-mãe.</p>
        ) : (
          <ul className="grid gap-3" aria-label="Módulos de memória">
            {report.memoryModules.map((module, index) => (
              // A placa pode repetir nomes de slot; a ordem vem da tabela SMBIOS.
              <ModuleRow key={index} module={module} />
            ))}
          </ul>
        )}
        <p className="text-xs text-subtle-foreground">
          Velocidade configurada abaixo da informada pelo módulo é só uma pista de XMP/EXPO
          desligado, nunca uma certeza.
        </p>
      </div>
    </WidgetCard>
  );
}
