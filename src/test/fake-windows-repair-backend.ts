import { vi } from "vitest";

import {
  type RepairHistoryEntry,
  type RepairProgress,
  type RepairReadiness,
  type RepairReport,
  type StepProgress,
} from "@/features/system/windows-repair/types";
import { mockDesktopRuntime } from "@/test/tauri";

export function sampleHistory(): RepairHistoryEntry[] {
  return [
    {
      startedAt: "2026-10-10T12:00:00Z",
      finishedAt: "2026-10-10T12:25:00Z",
      outcome: "success",
      steps: [
        { step: "checkHealth", result: { status: "health", health: "healthy" } },
        { step: "sfc", result: { status: "sfc", outcome: "repaired" } },
      ],
      restartRequired: false,
      error: null,
    },
    {
      startedAt: "2026-10-01T09:00:00Z",
      finishedAt: null,
      outcome: "interrupted",
      steps: [],
      restartRequired: false,
      error: null,
    },
  ];
}

function step(partial: Partial<StepProgress> & Pick<StepProgress, "step">): StepProgress {
  return { state: "pending", percent: null, result: null, ...partial };
}

/** Andamento no meio do ScanHealth. */
export function scanningProgress(): RepairProgress {
  return {
    phase: "running",
    cancelRequested: false,
    startedAtMs: Date.now() - 5 * 60_000,
    steps: [
      step({
        step: "checkHealth",
        state: "done",
        result: { status: "health", health: "healthy" },
      }),
      step({ step: "scanHealth", state: "running", percent: 42.5 }),
      step({ step: "restoreHealth" }),
      step({ step: "sfc" }),
    ],
  };
}

/** Andamento no meio do SFC (o cancelamento fica bloqueado). */
export function sfcProgress(): RepairProgress {
  const progress = scanningProgress();
  progress.steps = progress.steps.map((item) =>
    item.step === "sfc"
      ? { ...item, state: "running", percent: 10 }
      : { ...item, state: "done", result: { status: "skipped" }, percent: null },
  );
  return progress;
}

/**
 * Backend do reparo para testes de interface. `run_windows_repair` só resolve
 * quando o teste chama `finish`, como o reparo real (que leva minutos).
 */
export function mockWindowsRepairBackend(
  readiness: RepairReadiness = { toolsAvailable: true, pendingReboot: true, running: false },
) {
  let progress: RepairProgress | null = null;
  let resolveRun: ((report: RepairReport) => void) | undefined;

  const handlers = {
    check_windows_repair: vi.fn(() => readiness),
    run_windows_repair: vi.fn(
      () =>
        new Promise<RepairReport>((resolve) => {
          progress = {
            phase: "waitingElevation",
            cancelRequested: false,
            startedAtMs: Date.now(),
            steps: [],
          };
          resolveRun = resolve;
        }),
    ),
    get_windows_repair_progress: vi.fn(() => progress),
    cancel_windows_repair: vi.fn(() => {
      if (progress) progress = { ...progress, cancelRequested: true };
      return progress !== null;
    }),
    list_windows_repair_history: vi.fn(() => sampleHistory()),
  };
  mockDesktopRuntime(handlers);

  return {
    handlers,
    setProgress(next: RepairProgress) {
      progress = next;
    },
    finish(report: RepairReport) {
      progress = null;
      resolveRun?.(report);
    },
  };
}
