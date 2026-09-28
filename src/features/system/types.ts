/**
 * Contratos do monitoramento do sistema (Fase 3). Espelham
 * `src-tauri/src/domain/system_monitor.rs`. As leituras são ao vivo e nada é
 * persistido: o histórico dos gráficos existe só enquanto a tela está aberta.
 */

export type HealthStatus = "healthy" | "attention" | "critical";

/** Informações que não mudam durante a execução do app. */
export interface SystemInfo {
  hostName: string | null;
  /** Ex.: "Windows 11 Home". */
  osName: string | null;
  /** Número do build (ex.: "26200"). */
  osBuild: string | null;
  architecture: string;
  cpuBrand: string | null;
  physicalCores: number | null;
  logicalCores: number;
  totalMemoryBytes: number;
  /** Instante do boot em segundos desde a época Unix. */
  bootTimeSeconds: number;
}

export interface CpuUsage {
  /** Uso total entre 0 e 100; `null` até a segunda leitura ("Medindo…"). */
  usagePercent: number | null;
  /** Uso de cada núcleo lógico (vazio enquanto `usagePercent` for `null`). */
  coresPercent: number[];
}

export interface MemoryUsage {
  usedBytes: number;
  totalBytes: number;
  swapUsedBytes: number;
  swapTotalBytes: number;
}

export type DiskKind = "ssd" | "hdd" | "unknown";

export interface DiskUsage {
  /** Letra da unidade (ex.: "C:"). */
  mountPoint: string;
  /** Rótulo do volume (pode ser vazio). */
  label: string;
  fileSystem: string;
  kind: DiskKind;
  removable: boolean;
  usedBytes: number;
  totalBytes: number;
}

/** Leitura instantânea de CPU, memória e discos. */
export interface SystemSnapshot {
  cpu: CpuUsage;
  memory: MemoryUsage;
  disks: DiskUsage[];
  uptimeSeconds: number;
}

/** Processos com o mesmo executável, somados. */
export interface ProcessGroup {
  name: string;
  instances: number;
  /** Fração da CPU inteira (0 a 100). */
  cpuPercent: number;
  memoryBytes: number;
}

export interface ProcessList {
  /** `false` na primeira leitura: o uso de CPU por processo ainda não foi medido. */
  cpuMeasured: boolean;
  totalProcesses: number;
  groups: ProcessGroup[];
}
