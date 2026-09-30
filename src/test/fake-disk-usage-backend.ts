import { vi } from "vitest";

import {
  type DiskEntry,
  type DiskUsageProgress,
  type DiskUsageScan,
  type FolderChildren,
} from "@/features/system/disk-usage/types";
import { type SystemSnapshot } from "@/features/system/types";
import { mockDesktopRuntime } from "@/test/tauri";

const GIB = 1024 ** 3;
const MODIFIED = new Date(2026, 8, 28, 10, 0).getTime();

function folder(folderId: number, name: string, gib: number, files: number): DiskEntry {
  return {
    folderId,
    name,
    kind: "folder",
    bytes: gib * GIB,
    allocatedBytes: gib * GIB,
    files,
    modifiedMs: MODIFIED,
    unreadable: false,
    hasChildren: files > 0,
  };
}

function file(name: string, gib: number): DiskEntry {
  return {
    folderId: null,
    name,
    kind: "file",
    bytes: gib * GIB,
    allocatedBytes: gib * GIB,
    files: null,
    modifiedMs: MODIFIED,
    unreadable: false,
    hasChildren: false,
  };
}

/** C:\ → Users (bruno → video.mp4), Windows, System Volume Information (sem acesso), pagefile.sys. */
export const SAMPLE_CHILDREN: Record<number, FolderChildren> = {
  0: {
    path: "C:\\",
    entries: [
      folder(1, "Users", 80, 1_000),
      folder(2, "Windows", 30, 500),
      file("pagefile.sys", 8),
      { ...folder(3, "System Volume Information", 0, 0), unreadable: true },
    ],
    rest: { count: 3, bytes: 1024, allocatedBytes: 4096 },
  },
  1: { path: "C:\\Users", entries: [folder(4, "bruno", 80, 1_000)], rest: null },
  4: { path: "C:\\Users\\bruno", entries: [file("video.mp4", 12)], rest: null },
};

export const SAMPLE_DISK_SCAN: DiskUsageScan = {
  id: 5,
  mountPoint: "C:",
  fileSystem: "NTFS",
  volumeTotalBytes: 200 * GIB,
  volumeUsedBytes: 130 * GIB,
  root: folder(0, "C:\\", 118, 1_501),
  totals: {
    bytes: 118 * GIB,
    allocatedBytes: 118 * GIB,
    files: 1_501,
    folders: 40,
    unreadableFolders: 1,
    modifiedMs: MODIFIED,
  },
  stats: {
    skippedLinks: 2,
    hardLinkDuplicates: 0,
    hardLinkBytes: 0,
    cloudOnlyFiles: 0,
    cloudOnlyBytes: 0,
  },
  unaccountedBytes: 12 * GIB,
  largestFiles: [
    {
      path: "C:\\Users\\bruno\\video.mp4",
      bytes: 12 * GIB,
      allocatedBytes: 12 * GIB,
      modifiedMs: MODIFIED,
    },
    { path: "C:\\pagefile.sys", bytes: 8 * GIB, allocatedBytes: 8 * GIB, modifiedMs: MODIFIED },
  ],
  finishedAtMs: MODIFIED,
  durationMs: 3_400,
};

const SNAPSHOT: SystemSnapshot = {
  cpu: { usagePercent: null, coresPercent: [] },
  memory: { usedBytes: 8 * GIB, totalBytes: 16 * GIB, swapUsedBytes: 0, swapTotalBytes: 0 },
  disks: [
    {
      mountPoint: "C:",
      label: "",
      fileSystem: "NTFS",
      kind: "ssd",
      removable: false,
      usedBytes: 130 * GIB,
      totalBytes: 200 * GIB,
    },
    {
      mountPoint: "D:",
      label: "Dados",
      fileSystem: "NTFS",
      kind: "hdd",
      removable: false,
      usedBytes: 300 * GIB,
      totalBytes: 1000 * GIB,
    },
  ],
  uptimeSeconds: 3600,
};

/** O Tauri rejeita com o AppError serializado (objeto puro). */
export function fail(kind: string, message: string): never {
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  throw { kind, message };
}

interface BackendOptions {
  /** Última análise guardada no Rust ao abrir a tela. */
  latest?: DiskUsageScan | null;
  /** Andamento devolvido enquanto a análise roda. */
  progress?: DiskUsageProgress | null;
  /** Uma análise já estava rodando ao abrir a tela (termina com `finishRunning`). */
  runningOnOpen?: boolean;
  /** Substitui a análise simulada (ex.: para testar andamento e cancelamento). */
  scan?: (args: { mountPoint: string }) => DiskUsageScan | null | Promise<DiskUsageScan | null>;
}

/** Backend do Espaço em disco para testes de interface. */
export function mockDiskUsageBackend(options: BackendOptions = {}) {
  let running = options.runningOnOpen ?? false;
  let latest = options.latest ?? null;
  const scan = options.scan ?? (() => SAMPLE_DISK_SCAN);
  const handlers = {
    get_system_snapshot: vi.fn(() => SNAPSHOT),
    get_disk_usage_scan: vi.fn(() => latest),
    // Como no Rust: só há andamento enquanto uma análise roda.
    get_disk_usage_progress: vi.fn(() => (running ? (options.progress ?? null) : null)),
    scan_disk_usage: vi.fn(async (args: { mountPoint: string }) => {
      running = true;
      try {
        const result = await scan(args);
        if (result) latest = result;
        return result;
      } finally {
        running = false;
      }
    }),
    cancel_disk_usage: vi.fn(() => true),
    list_disk_usage_children: vi.fn((args: { scanId: number; folderId: number; limit: number }) => {
      const children = SAMPLE_CHILDREN[args.folderId];
      if (!children) return fail("not_found", "Pasta não encontrada nesta análise.");
      return children;
    }),
  };
  mockDesktopRuntime(handlers);
  /** Termina a análise que já rodava ao abrir a tela. */
  const finishRunning = (result: DiskUsageScan) => {
    running = false;
    latest = result;
  };
  return { handlers, finishRunning };
}
