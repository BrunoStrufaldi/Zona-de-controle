import { useCallback, useEffect, useState } from "react";

import { type RepairProgress, type RepairReport } from "@/features/system/windows-repair/types";
import { type ServiceError, toServiceError } from "@/services/tauri/errors";
import {
  cancelWindowsRepair,
  getWindowsRepairProgress,
  runWindowsRepair,
} from "@/services/windows-repair-service";

/** Intervalo entre as consultas de andamento enquanto o reparo roda. */
export const REPAIR_PROGRESS_INTERVAL_MS = 300;

export type RepairRunState =
  | { phase: "idle" }
  | { phase: "running"; progress: RepairProgress | null; cancelRequested: boolean }
  | { phase: "done"; report: RepairReport }
  | { phase: "error"; error: ServiceError };

export interface WindowsRepairRun {
  state: RepairRunState;
  /** Começa o reparo (chamar só depois da confirmação explícita). */
  start: () => void;
  cancel: () => void;
  reset: () => void;
}

/** Execução do reparo: o comando resolve no fim; o andamento é consultado à parte. */
export function useWindowsRepair(): WindowsRepairRun {
  const [state, setState] = useState<RepairRunState>({ phase: "idle" });
  const running = state.phase === "running";

  const start = useCallback(() => {
    setState({ phase: "running", progress: null, cancelRequested: false });
    runWindowsRepair().then(
      (report) => {
        setState({ phase: "done", report });
      },
      (error: unknown) => {
        setState({ phase: "error", error: toServiceError(error) });
      },
    );
  }, []);

  // Consulta o andamento sem leituras simultâneas enquanto roda.
  useEffect(() => {
    if (!running) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      getWindowsRepairProgress().then(
        (progress) => {
          if (!active) return;
          if (progress) {
            setState((current) =>
              current.phase === "running" ? { ...current, progress } : current,
            );
          }
          timer = setTimeout(read, REPAIR_PROGRESS_INTERVAL_MS);
        },
        () => {
          // O andamento é só informativo: tenta de novo no próximo intervalo.
          if (active) timer = setTimeout(read, REPAIR_PROGRESS_INTERVAL_MS);
        },
      );
    };
    read();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [running]);

  const cancel = useCallback(() => {
    setState((current) =>
      current.phase === "running" ? { ...current, cancelRequested: true } : current,
    );
    void cancelWindowsRepair().catch(() => undefined);
  }, []);

  const reset = useCallback(() => {
    setState({ phase: "idle" });
  }, []);

  return { state, start, cancel, reset };
}
