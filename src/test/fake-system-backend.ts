import { vi } from "vitest";

import { type ProcessGroup, type SystemInfo, type SystemSnapshot } from "@/features/system/types";
import { mockDesktopRuntime } from "@/test/tauri";

const GIB = 1024 ** 3;

export const FAKE_SYSTEM_INFO: SystemInfo = {
  hostName: "ESTACAO",
  osName: "Windows 11 Home",
  osBuild: "26200",
  architecture: "x86_64",
  cpuBrand: "Processador de Teste",
  physicalCores: 2,
  logicalCores: 4,
  totalMemoryBytes: 16 * GIB,
  bootTimeSeconds: 1_790_000_000,
};

export const FAKE_PROCESSES: ProcessGroup[] = [
  { name: "navegador.exe", instances: 12, cpuPercent: 4.5, memoryBytes: 2 * GIB },
  { name: "editor.exe", instances: 1, cpuPercent: 12.25, memoryBytes: 0.5 * GIB },
  { name: "musica.exe", instances: 1, cpuPercent: 0, memoryBytes: 0.25 * GIB },
];

/**
 * Backend do monitor para testes de interface. A primeira leitura vem sem CPU
 * medida (como no Rust); as seguintes, com `cpuPercent`.
 */
export function mockSystemBackend({ cpuPercent = 37 }: { cpuPercent?: number } = {}) {
  let snapshotReads = 0;
  let processReads = 0;

  const snapshot = (): SystemSnapshot => {
    const measured = snapshotReads++ > 0;
    return {
      cpu: {
        usagePercent: measured ? cpuPercent : null,
        coresPercent: measured ? [cpuPercent, 10, 20, 30] : [],
      },
      memory: {
        usedBytes: 12 * GIB,
        totalBytes: 16 * GIB,
        swapUsedBytes: 0,
        swapTotalBytes: 4 * GIB,
      },
      disks: [
        {
          mountPoint: "C:",
          label: "",
          fileSystem: "NTFS",
          kind: "ssd",
          removable: false,
          usedBytes: 460 * GIB,
          totalBytes: 500 * GIB,
        },
        {
          mountPoint: "E:",
          label: "Pendrive",
          fileSystem: "exFAT",
          kind: "unknown",
          removable: true,
          usedBytes: 8 * GIB,
          totalBytes: 32 * GIB,
        },
      ],
      uptimeSeconds: 2 * 86_400 + 3 * 3600,
    };
  };

  const handlers = {
    get_system_info: vi.fn(() => FAKE_SYSTEM_INFO),
    get_system_snapshot: vi.fn(snapshot),
    list_processes: vi.fn(() => ({
      cpuMeasured: processReads++ > 0,
      totalProcesses: 14,
      groups: FAKE_PROCESSES,
    })),
  };
  mockDesktopRuntime(handlers);
  return { handlers };
}
