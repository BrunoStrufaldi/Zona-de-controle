import {
  type DiskUsageProgress,
  type DiskUsageScan,
  type HiddenItems,
} from "@/features/system/disk-usage/types";
import { formatBytes, formatNumber, formatPercent } from "@/lib/format";
import { safeRatio } from "@/lib/math";

/** Itens pedidos por pasta ao abri-la (o Rust aceita até 500). */
export const CHILDREN_LIMIT = 200;

/** Intervalo entre as consultas de andamento enquanto a análise roda. */
export const PROGRESS_INTERVAL_MS = 300;

/** 0,25 → "25%"; abaixo de 10%, com uma casa; quase nada → "<0,1%". */
export function shareLabel(share: number): string {
  if (share > 0 && share < 0.001) return `<${formatPercent(0.001, 1)}`;
  return formatPercent(share, share < 0.1 ? 1 : 0);
}

/** Fração do espaço da pasta de cima (0 a 1), pelo espaço em disco. */
export function shareOfParent(allocatedBytes: number, parentAllocatedBytes: number): number {
  return Math.min(1, safeRatio(allocatedBytes, parentAllocatedBytes));
}

function plural(count: number, one: string, many: string): string {
  return `${formatNumber(count, 0)} ${count === 1 ? one : many}`;
}

export function filesLabel(count: number): string {
  return plural(count, "arquivo", "arquivos");
}

export function foldersLabel(count: number): string {
  return plural(count, "pasta", "pastas");
}

/** "1.234 itens menores" — o que ficou de fora da lista de uma pasta. */
export function restLabel(rest: HiddenItems): string {
  return plural(rest.count, "item menor", "itens menores");
}

/** 3_400 → "3 s"; 72_000 → "1 min 12 s". */
export function scanDurationLabel(durationMs: number): string {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/** Separa "C:\Users\bruno\video.mp4" em nome e pasta. */
export function splitPath(path: string): { name: string; folder: string } {
  const index = path.lastIndexOf("\\");
  if (index < 0) return { name: path, folder: "" };
  const folder = path.slice(0, index);
  // A raiz mantém a barra ("C:\").
  return { name: path.slice(index + 1), folder: folder.endsWith(":") ? `${folder}\\` : folder };
}

/** Caminho de um item dentro da pasta `folder`. */
export function joinPath(folder: string, name: string): string {
  return folder.endsWith("\\") ? `${folder}${name}` : `${folder}\\${name}`;
}

/** Fração da unidade já percorrida, pelo espaço em uso (a contagem de arquivos não é conhecida antes). */
export function progressShare(progress: DiskUsageProgress, volumeUsedBytes: number): number {
  return Math.min(1, safeRatio(progress.allocatedBytes, volumeUsedBytes));
}

export interface ScanNote {
  id: "unaccounted" | "hardLinks" | "cloudOnly" | "links";
  text: string;
}

/** O que explica a diferença entre o espaço em uso e o somado nas pastas. */
export function scanNotes(scan: DiskUsageScan): ScanNote[] {
  const notes: ScanNote[] = [];
  const { stats, totals } = scan;
  if (scan.unaccountedBytes > 0) {
    const unreadable =
      totals.unreadableFolders > 0
        ? `${foldersLabel(totals.unreadableFolders)} sem acesso (como System Volume Information, onde ficam os pontos de restauração)`
        : "pastas sem acesso";
    notes.push({
      id: "unaccounted",
      text: `${formatBytes(scan.unaccountedBytes)} em uso na unidade não aparecem em nenhuma pasta: ${unreadable} e arquivos internos do sistema de arquivos. Sem administrador, o app não lê esses locais e não estima o que há neles.`,
    });
  }
  if (stats.hardLinkDuplicates > 0) {
    notes.push({
      id: "hardLinks",
      text: `${plural(stats.hardLinkDuplicates, "nome repetido", "nomes repetidos")} de arquivos (${formatBytes(stats.hardLinkBytes)}) por links físicos, comuns em C:\\Windows\\WinSxS: o mesmo arquivo aparece em mais de uma pasta e foi contado uma vez só, na primeira pasta lida.`,
    });
  }
  if (stats.cloudOnlyFiles > 0) {
    const one = stats.cloudOnlyFiles === 1;
    notes.push({
      id: "cloudOnly",
      text: `${filesLabel(stats.cloudOnlyFiles)} (${formatBytes(stats.cloudOnlyBytes)}) ${one ? "está" : "estão"} só na nuvem (OneDrive) e quase não ${one ? "ocupa" : "ocupam"} o disco até ${one ? "ser baixado" : "serem baixados"}.`,
    });
  }
  if (stats.skippedLinks > 0) {
    notes.push({
      id: "links",
      text: `${plural(stats.skippedLinks, "atalho de pasta (link ou junção) não foi seguido", "atalhos de pasta (links e junções) não foram seguidos")}, para nada ser contado duas vezes.`,
    });
  }
  return notes;
}

export interface VolumeSegments {
  /** Encontrado nas pastas. */
  scannedBytes: number;
  /** Em uso, mas fora das pastas lidas. */
  unaccountedBytes: number;
  freeBytes: number;
  totalBytes: number;
}

/** Divisão da unidade para a barra do resumo (as partes somam o total). */
export function volumeSegments(scan: DiskUsageScan): VolumeSegments {
  const totalBytes = Math.max(scan.volumeTotalBytes, scan.volumeUsedBytes);
  const scannedBytes = Math.min(scan.totals.allocatedBytes, scan.volumeUsedBytes);
  return {
    scannedBytes,
    unaccountedBytes: scan.volumeUsedBytes - scannedBytes,
    freeBytes: totalBytes - scan.volumeUsedBytes,
    totalBytes,
  };
}
