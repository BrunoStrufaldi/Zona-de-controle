import { useCallback, useEffect, useRef, useState } from "react";

import { PROGRESS_INTERVAL_MS } from "@/features/system/disk-usage/domain/disk-usage";
import { type DiskUsageProgress, type DiskUsageScan } from "@/features/system/disk-usage/types";
import {
  cancelDiskUsage,
  getDiskUsageProgress,
  getDiskUsageScan,
  scanDiskUsage,
} from "@/services/disk-usage-service";
import { type ServiceError, toServiceError } from "@/services/tauri/errors";

export type DiskUsageState =
  /** Lendo a última análise (ou uma em andamento) no Rust. */
  | { phase: "loading" }
  /** A leitura inicial falhou (ex.: fora do app desktop). */
  | { phase: "failed"; error: ServiceError }
  /** `error`: a última análise pedida falhou (a anterior continua em `scan`). */
  | { phase: "ready"; scan: DiskUsageScan | null; error: ServiceError | null }
  | {
      phase: "running";
      mountPoint: string;
      progress: DiskUsageProgress | null;
      cancelRequested: boolean;
      /** Iniciada por esta tela (resolve pelo comando) ou encontrada ao abrir (pelo andamento). */
      owned: boolean;
      previous: DiskUsageScan | null;
    };

export interface DiskUsageScanControl {
  state: DiskUsageState;
  start: (mountPoint: string) => void;
  cancel: () => void;
}

async function loadLatest(): Promise<DiskUsageState> {
  const progress = await getDiskUsageProgress();
  if (progress) {
    // Análise iniciada antes de a tela abrir (ex.: saiu e voltou): acompanha.
    return {
      phase: "running",
      mountPoint: progress.mountPoint,
      progress,
      cancelRequested: progress.cancelRequested,
      owned: false,
      previous: null,
    };
  }
  return { phase: "ready", scan: await getDiskUsageScan(), error: null };
}

/**
 * Análise do Espaço em disco: a última concluída (guardada no Rust enquanto o
 * app está aberto), iniciar, acompanhar o andamento e cancelar.
 */
export function useDiskUsageScan(): DiskUsageScanControl {
  const [state, setState] = useState<DiskUsageState>({ phase: "loading" });
  // Última análise concluída: volta a aparecer se a nova for cancelada ou falhar.
  const lastScan = useRef<DiskUsageScan | null>(null);
  useEffect(() => {
    if (state.phase === "ready") lastScan.current = state.scan;
  }, [state]);
  const running = state.phase === "running";
  const owned = state.phase === "running" && state.owned;

  useEffect(() => {
    let active = true;
    loadLatest().then(
      (next) => {
        if (active) setState(next);
      },
      (error: unknown) => {
        if (active) setState({ phase: "failed", error: toServiceError(error) });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const start = useCallback((mountPoint: string) => {
    const previous = lastScan.current;
    setState({
      phase: "running",
      mountPoint,
      progress: null,
      cancelRequested: false,
      owned: true,
      previous,
    });
    scanDiskUsage(mountPoint).then(
      (scan) => {
        // Cancelada: volta para a análise anterior.
        setState({ phase: "ready", scan: scan ?? previous, error: null });
      },
      (error: unknown) => {
        setState({ phase: "ready", scan: previous, error: toServiceError(error) });
      },
    );
  }, []);

  // Consulta o andamento, sem leituras simultâneas, enquanto roda.
  useEffect(() => {
    if (!running) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      getDiskUsageProgress().then(
        (progress) => {
          if (!active) return;
          if (progress) {
            setState((current) =>
              current.phase === "running"
                ? {
                    ...current,
                    progress,
                    cancelRequested: current.cancelRequested || progress.cancelRequested,
                  }
                : current,
            );
          } else if (!owned) {
            // A análise que já rodava terminou: mostra o resultado dela.
            loadLatest().then(
              (next) => {
                if (active) setState(next);
              },
              (error: unknown) => {
                if (active) setState({ phase: "failed", error: toServiceError(error) });
              },
            );
            return;
          }
          timer = setTimeout(read, PROGRESS_INTERVAL_MS);
        },
        () => {
          // O andamento é só informativo: tenta de novo no próximo intervalo.
          if (active) timer = setTimeout(read, PROGRESS_INTERVAL_MS);
        },
      );
    };
    read();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [running, owned]);

  const cancel = useCallback(() => {
    setState((current) =>
      current.phase === "running" ? { ...current, cancelRequested: true } : current,
    );
    void cancelDiskUsage().catch(() => undefined);
  }, []);

  return { state, start, cancel };
}
