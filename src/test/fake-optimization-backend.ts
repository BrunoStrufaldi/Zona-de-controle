import { vi } from "vitest";

import {
  type CleanupItem,
  type CleanupProgress,
  type CleanupReport,
  type CleanupScan,
  type CleanupSource,
  type SourceSummary,
} from "@/features/system/optimization/types";
import { mockDesktopRuntime } from "@/test/tauri";

const MIB = 1024 ** 2;

function summary(overrides: Partial<SourceSummary> & Pick<SourceSummary, "source">): SourceSummary {
  const category =
    overrides.source === "userTemp"
      ? "tempFiles"
      : overrides.source === "recycleBin"
        ? "recycleBin"
        : "safeCaches";
  return {
    category,
    status: "ready",
    folders: [`C:\\Users\\teste\\AppData\\Local\\${overrides.source}`],
    itemCount: 0,
    totalBytes: 0,
    recentCount: 0,
    recentBytes: 0,
    ignoredCount: 0,
    ...overrides,
  };
}

/**
 * Análise típica: temporários (com recentes de fora), shaders da NVIDIA,
 * Chrome aberto, Lixeira com um item e origens não encontradas.
 */
export const SAMPLE_SCAN: CleanupScan = {
  id: 7,
  tempMinAgeHours: 24,
  sources: [
    summary({
      source: "userTemp",
      itemCount: 250,
      totalBytes: 300 * MIB,
      recentCount: 12,
      recentBytes: 40 * MIB,
    }),
    summary({ source: "directXShaders", itemCount: 0, totalBytes: 0 }),
    summary({ source: "nvidiaShaders", itemCount: 3, totalBytes: 2048 * MIB }),
    summary({ source: "amdShaders", status: "notFound", folders: [] }),
    summary({ source: "errorReports", status: "notFound", folders: [] }),
    summary({ source: "crashDumps", itemCount: 2, totalBytes: 20 * MIB }),
    summary({ source: "thumbnails", itemCount: 15, totalBytes: 10 * MIB, ignoredCount: 1 }),
    summary({ source: "chrome", status: "inUse", itemCount: 900, totalBytes: 1024 * MIB }),
    summary({ source: "edge", itemCount: 40, totalBytes: 50 * MIB }),
    summary({ source: "brave", status: "notFound", folders: [] }),
    summary({ source: "firefox", status: "notFound", folders: [] }),
    summary({
      source: "recycleBin",
      itemCount: 1,
      totalBytes: 5 * MIB,
      folders: ["C:\\$Recycle.Bin\\S-1-5-21-1"],
    }),
  ],
};

/** Itens gerados: `count` arquivos numerados, maiores primeiro. */
function itemsOf(source: CleanupSource, count: number): CleanupItem[] {
  return Array.from({ length: count }, (_, index) => ({
    path:
      source === "recycleBin"
        ? `D:\\Fotos\\antiga-${index}.jpg`
        : `C:\\Users\\teste\\AppData\\Local\\${source}\\arquivo-${index}.tmp`,
    bytes: (count - index) * 1024,
    dateMs: new Date(2026, 8, 20, 14, 30).getTime(),
  }));
}

/**
 * Relatório de uma limpeza sem cancelamento: tudo removido, menos 2 arquivos
 * temporários em uso.
 */
export function sampleReport(scan: CleanupScan, sources: CleanupSource[]): CleanupReport {
  const results = scan.sources
    .filter((summary) => sources.includes(summary.source))
    .map((summary) => {
      const inUse = summary.source === "userTemp" ? 2 : 0;
      return {
        source: summary.source,
        plannedCount: summary.itemCount,
        removedCount: summary.itemCount - inUse,
        removedBytes: summary.totalBytes - inUse * MIB,
        inUseCount: inUse,
        changedCount: 0,
        failedCount: 0,
      };
    });
  return {
    cancelled: false,
    sources: results,
    notRemoved: sources.includes("userTemp")
      ? [
          { path: "C:\\Users\\teste\\AppData\\Local\\Temp\\aberto-1.tmp", reason: "inUse" },
          { path: "C:\\Users\\teste\\AppData\\Local\\Temp\\aberto-2.tmp", reason: "inUse" },
        ]
      : [],
  };
}

type RunArgs = { scanId: number; sources: CleanupSource[] };

interface BackendOptions {
  /** Substitui a limpeza simulada (ex.: para testar cancelamento ou erro). */
  runCleanup?: (args: RunArgs) => CleanupReport | Promise<CleanupReport>;
  progress?: CleanupProgress | null;
}

export function mockOptimizationBackend(
  scan: CleanupScan = SAMPLE_SCAN,
  options: BackendOptions = {},
) {
  const handlers = {
    scan_cleanup: vi.fn(() => scan),
    list_cleanup_items: vi.fn(
      (args: { scanId: number; source: CleanupSource; offset: number; limit: number }) => {
        const count = scan.sources.find((entry) => entry.source === args.source)?.itemCount ?? 0;
        const items = itemsOf(args.source, count);
        return {
          items: items.slice(args.offset, args.offset + args.limit),
          total: items.length,
        };
      },
    ),
    run_cleanup: vi.fn(options.runCleanup ?? ((args: RunArgs) => sampleReport(scan, args.sources))),
    get_cleanup_progress: vi.fn(() => options.progress ?? null),
    cancel_cleanup: vi.fn(() => true),
  };
  mockDesktopRuntime(handlers);
  return { handlers };
}
