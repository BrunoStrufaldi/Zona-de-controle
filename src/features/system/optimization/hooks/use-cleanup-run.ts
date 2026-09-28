import { useCallback, useEffect, useState } from "react";

import {
  type CleanupProgress,
  type CleanupReport,
  type CleanupSource,
} from "@/features/system/optimization/types";
import { cancelCleanup, getCleanupProgress, runCleanup } from "@/services/optimization-service";
import { type ServiceError, toServiceError } from "@/services/tauri/errors";

/** Intervalo entre as consultas de andamento enquanto a limpeza roda. */
export const CLEANUP_PROGRESS_INTERVAL_MS = 300;

export type CleanupRunState =
  | { phase: "idle" }
  | { phase: "running"; progress: CleanupProgress | null; cancelRequested: boolean }
  | { phase: "done"; report: CleanupReport }
  | { phase: "error"; error: ServiceError };

export interface CleanupRun {
  state: CleanupRunState;
  /** Começa a limpeza (chamar só depois da confirmação explícita). */
  start: (scanId: number, sources: CleanupSource[]) => void;
  cancel: () => void;
  /** Volta ao estado inicial depois de ver o resultado. */
  reset: () => void;
}

/** Execução da limpeza: o comando resolve no fim; o andamento é consultado à parte. */
export function useCleanupRun(): CleanupRun {
  const [state, setState] = useState<CleanupRunState>({ phase: "idle" });
  const running = state.phase === "running";

  const start = useCallback((scanId: number, sources: CleanupSource[]) => {
    setState({ phase: "running", progress: null, cancelRequested: false });
    runCleanup(scanId, sources).then(
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
      getCleanupProgress().then(
        (progress) => {
          if (!active) return;
          if (progress) {
            setState((current) =>
              current.phase === "running" ? { ...current, progress } : current,
            );
          }
          timer = setTimeout(read, CLEANUP_PROGRESS_INTERVAL_MS);
        },
        () => {
          // O andamento é só informativo: tenta de novo no próximo intervalo.
          if (active) timer = setTimeout(read, CLEANUP_PROGRESS_INTERVAL_MS);
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
    void cancelCleanup().catch(() => undefined);
  }, []);

  const reset = useCallback(() => {
    setState({ phase: "idle" });
  }, []);

  return { state, start, cancel, reset };
}
