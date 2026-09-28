import { type DiskKind, type DiskUsage } from "@/features/system/types";

export const diskKindLabels: Record<DiskKind, string> = {
  ssd: "SSD",
  hdd: "HD",
  unknown: "Tipo desconhecido",
};

/** Rótulo do volume ou, sem rótulo, um nome genérico pelo tipo de unidade. */
export function diskDisplayName(disk: DiskUsage): string {
  if (disk.label !== "") return disk.label;
  return disk.removable ? "Unidade removível" : "Disco local";
}
