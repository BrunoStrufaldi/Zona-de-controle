import { Cpu } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import { StatusList } from "@/features/system/system-settings/components/status-list";
import {
  boardLabel,
  firmwareLabels,
  secureBootLabel,
  tpmLabels,
  virtualizationLabels,
} from "@/features/system/system-settings/domain/hardware";
import { NOT_AVAILABLE } from "@/features/system/system-settings/domain/settings";
import { type HardwareReport } from "@/features/system/system-settings/types";
import { formatDate } from "@/lib/format";

function biosLabel(report: HardwareReport): string {
  const bios = report.bios;
  if (!bios || (!bios.version && !bios.releaseDate)) return NOT_AVAILABLE;
  const parts = [
    bios.version && `Versão ${bios.version}`,
    bios.releaseDate && `de ${formatDate(bios.releaseDate)}`,
  ].filter(Boolean);
  return parts.join(" ");
}

function memoryIntegrityLabel(value: boolean | null): string {
  if (value === null) return NOT_AVAILABLE;
  return value ? "Ligada" : "Desligada";
}

/** Placa-mãe, BIOS e recursos do firmware. O app nunca altera a BIOS. */
export function FirmwareCard({ report }: { report: HardwareReport }) {
  return (
    <WidgetCard title="Placa-mãe e BIOS" icon={Cpu} contentClassName="gap-4">
      <StatusList
        label="Leituras do firmware"
        rows={[
          { label: "Placa-mãe", value: boardLabel(report.board) },
          {
            label: "BIOS",
            value: biosLabel(report),
            hint: report.bios?.vendor ?? undefined,
          },
          {
            label: "Firmware",
            value: report.firmware ? firmwareLabels[report.firmware] : NOT_AVAILABLE,
          },
          { label: "Secure Boot", value: secureBootLabel(report.secureBoot, report.firmware) },
          { label: "TPM", value: report.tpm ? tpmLabels[report.tpm] : NOT_AVAILABLE },
          {
            label: "Virtualização",
            value: report.virtualization
              ? virtualizationLabels[report.virtualization]
              : NOT_AVAILABLE,
            hint:
              report.virtualization === "inUse"
                ? "O Windows está usando a virtualização (Hyper-V, segurança baseada em virtualização…)."
                : undefined,
          },
          {
            label: "Integridade da memória",
            value: memoryIntegrityLabel(report.memoryIntegrity),
            hint: "Proteção do Windows contra drivers maliciosos (Segurança do Windows > Segurança do dispositivo > Isolamento de núcleo). Só informativo.",
          },
        ]}
      />
    </WidgetCard>
  );
}
