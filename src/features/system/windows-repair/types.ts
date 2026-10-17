/**
 * Contratos do reparo do Windows (Fase 4.7). Espelham
 * `src-tauri/src/domain/windows_repair.rs`. O reparo exige administrador: o app
 * pede a elevação pelo UAC a cada execução e roda só a sequência fixa DISM + SFC.
 */

import { type IsoDateTime } from "@/types/common";

export type RepairStep = "checkHealth" | "scanHealth" | "restoreHealth" | "sfc";
export type ImageHealth = "healthy" | "repairable" | "nonRepairable";
export type SfcOutcome = "noViolations" | "repaired" | "couldNotRepair" | "unknown";
export type RepairErrorKind =
  "sourceMissing" | "downloadFailed" | "rebootPending" | "busy" | "other";

export type StepResult =
  | { status: "health"; health: ImageHealth }
  | { status: "restored"; restartRequired: boolean }
  | { status: "sfc"; outcome: SfcOutcome }
  | { status: "skipped" }
  | { status: "cancelled" }
  | { status: "failed"; code: number | null; kind: RepairErrorKind; detail: string };

export type StepState = "pending" | "running" | "done";

export interface StepProgress {
  step: RepairStep;
  state: StepState;
  /** 0–100 no passo em andamento; `null` antes do primeiro aviso. */
  percent: number | null;
  result: StepResult | null;
}

export interface RepairProgress {
  /** Esperando a resposta ao UAC, ou rodando. */
  phase: "waitingElevation" | "running";
  steps: StepProgress[];
  cancelRequested: boolean;
  startedAtMs: number;
}

export type RepairOutcome = "success" | "cancelled" | "failure" | "interrupted";

export interface StepRecord {
  step: RepairStep;
  result: StepResult;
}

export interface RepairReport {
  runId: string;
  outcome: RepairOutcome;
  steps: StepRecord[];
  restartRequired: boolean;
  /** Erro antes dos passos (UAC recusado, ajudante sem resposta…). */
  error: string | null;
}

export interface RepairReadiness {
  toolsAvailable: boolean;
  /** `null` = não deu para ler. */
  pendingReboot: boolean | null;
  running: boolean;
}

export interface RepairHistoryEntry {
  startedAt: IsoDateTime;
  /** `null` = o app fechou antes do fim (interrompido). */
  finishedAt: IsoDateTime | null;
  outcome: RepairOutcome;
  steps: StepRecord[];
  restartRequired: boolean;
  error: string | null;
}
