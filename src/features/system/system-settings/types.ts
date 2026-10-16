/**
 * Contratos das configurações do Windows e do hardware (Fase 4.5). Espelham
 * `src-tauri/src/domain/system_settings/`. Somente leitura: nada é alterado.
 * `null` = leitura indisponível ("Não disponível"), nunca um valor estimado.
 */

import { type IsoDate } from "@/types/common";

export type FindingLevel = "suggestion" | "attention" | "critical";

export type PlanKind =
  "balanced" | "highPerformance" | "powerSaver" | "ultimatePerformance" | "custom";

export interface PowerPlan {
  guid: string;
  /** Nome que o Windows mostra (já em pt-BR, ou o dado pelo usuário). */
  name: string;
  kind: PlanKind;
  active: boolean;
}

export interface PowerStatus {
  plans: PowerPlan[];
  /** Modern Standby: o Windows usa "modos de energia" e ignora os planos. */
  modernStandby: boolean;
  hasBattery: boolean;
}

export interface GameModeStatus {
  enabled: boolean;
  /** Sem valor gravado: vale o padrão do Windows (ligado). */
  byDefault: boolean;
}

/** Agendamento de GPU acelerado por hardware (HAGS) de uma placa. */
export interface GpuScheduling {
  name: string;
  supported: boolean;
  enabled: boolean;
}

export interface PendingReboot {
  windowsUpdate: boolean;
  servicing: boolean;
}

export type StartupLocation =
  "userRun" | "userStartupFolder" | "machineRun" | "machineRun32" | "commonStartupFolder";

export type StartupState = "enabled" | "disabled" | "unknown";

export interface StartupItem {
  /** `local:nome`, estável entre leituras. */
  id: string;
  location: StartupLocation;
  name: string;
  command: string | null;
  state: StartupState;
  /** Quando foi desligado (ms desde 1970), se o Windows guardou. */
  disabledAtMs: number | null;
  /** O executável existe? `null` = não verificado. */
  targetExists: boolean | null;
  /** Itens da máquina exigem administrador para mudar. */
  editable: boolean;
}

export type PackagedState =
  "enabled" | "disabled" | "disabledByUser" | "disabledByPolicy" | "enabledByPolicy" | "unknown";

/** Tarefa de inicialização de um app da Microsoft Store. */
export interface PackagedTask {
  package: string;
  taskId: string;
  state: PackagedState;
}

export interface StartupReport {
  items: StartupItem[];
  packaged: PackagedTask[];
  packagedAvailable: boolean;
}

export type SettingsFinding = { level: FindingLevel } & (
  | { kind: "pendingReboot"; windowsUpdate: boolean; servicing: boolean }
  | {
      kind: "powerPlan";
      current: string | null;
      suggestedGuid: string;
      suggestedName: string;
      hasBattery: boolean;
    }
  | { kind: "gameModeOff" }
);

export interface WindowsSettingsReport {
  power: PowerStatus | null;
  gameMode: GameModeStatus | null;
  gpus: GpuScheduling[] | null;
  pendingReboot: PendingReboot | null;
  startup: StartupReport;
  /** Mais graves primeiro. */
  findings: SettingsFinding[];
}

export type FirmwareKind = "uefi" | "legacy";
export type TpmStatus = "tpm12" | "tpm20" | "notFound";
export type VirtualizationState = "inUse" | "enabled" | "disabled";
export type MemoryKind = "ddr3" | "ddr4" | "ddr5" | "lpddr4" | "lpddr5";

export interface BiosInfo {
  vendor: string | null;
  version: string | null;
  releaseDate: IsoDate | null;
}

export interface BoardInfo {
  manufacturer: string | null;
  product: string | null;
}

export interface CpuInfo {
  name: string | null;
  vendor: string | null;
  family: number | null;
  model: number | null;
  stepping: number | null;
  /** Revisão do microcódigo (só em processadores Intel). */
  microcode: number | null;
}

export interface MemoryModule {
  locator: string | null;
  manufacturer: string | null;
  partNumber: string | null;
  kind: MemoryKind | null;
  sizeBytes: number | null;
  /** Velocidade máxima informada pelo módulo (MT/s). */
  maxSpeedMts: number | null;
  /** Velocidade configurada pela placa (MT/s). */
  configuredSpeedMts: number | null;
}

export interface MemorySpeed {
  locator: string | null;
  configuredMts: number;
  maxMts: number;
}

export type HardwareFinding = { level: FindingLevel } & (
  | { kind: "microcodeOutdated"; revision: number; minimum: number }
  | { kind: "memoryBelowRated"; modules: MemorySpeed[] }
  | { kind: "mixedMemoryModules"; partNumbers: string[] }
  | { kind: "biosAge"; releaseDate: IsoDate; months: number }
  | { kind: "secureBootOff" }
  | { kind: "tpmMissing"; status: TpmStatus }
);

export interface HardwareReport {
  firmware: FirmwareKind | null;
  bios: BiosInfo | null;
  board: BoardInfo | null;
  secureBoot: boolean | null;
  tpm: TpmStatus | null;
  cpu: CpuInfo;
  virtualization: VirtualizationState | null;
  /** Integridade da memória (HVCI) em execução. Só informativo. */
  memoryIntegrity: boolean | null;
  smbiosAvailable: boolean;
  memoryModules: MemoryModule[];
  /** Mais graves primeiro. */
  findings: HardwareFinding[];
}
