import { useCallback, useEffect, useState } from "react";

import { UPDATE_PROGRESS_INTERVAL_MS } from "@/features/app-update/domain/update";
import { checkAppUpdate, getAppUpdateProgress, installAppUpdate } from "@/services/app-service";
import { type ServiceError, toServiceError } from "@/services/tauri/errors";
import { type AvailableUpdate, type UpdateProgress } from "@/types/app";

export type AppUpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "up-to-date" }
  | { phase: "available"; update: AvailableUpdate }
  | { phase: "installing"; update: AvailableUpdate; progress: UpdateProgress | null }
  /** `update` fica quando a falha foi na instalação, para tentar de novo. */
  | { phase: "error"; error: ServiceError; update: AvailableUpdate | null };

export interface AppUpdate {
  state: AppUpdateState;
  /** Procura uma versão nova (só pelo botão, nunca sozinho). */
  check: () => void;
  /** Instala a versão encontrada (chamar só depois da confirmação explícita). */
  install: (update: AvailableUpdate) => void;
}

/** Busca e instalação da atualização; o andamento é consultado à parte, como na limpeza. */
export function useAppUpdate(): AppUpdate {
  const [state, setState] = useState<AppUpdateState>({ phase: "idle" });
  const installing = state.phase === "installing";

  const check = useCallback(() => {
    setState({ phase: "checking" });
    checkAppUpdate().then(
      (update) => {
        setState(update ? { phase: "available", update } : { phase: "up-to-date" });
      },
      (error: unknown) => {
        setState({ phase: "error", error: toServiceError(error), update: null });
      },
    );
  }, []);

  const install = useCallback((update: AvailableUpdate) => {
    setState({ phase: "installing", update, progress: null });
    // No Windows o app fecha ao abrir o instalador; a promessa só volta em erro.
    installAppUpdate(update.version).catch((error: unknown) => {
      setState({ phase: "error", error: toServiceError(error), update });
    });
  }, []);

  // Consulta o andamento sem leituras simultâneas enquanto instala.
  useEffect(() => {
    if (!installing) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      getAppUpdateProgress().then(
        (progress) => {
          if (!active) return;
          if (progress) {
            setState((current) =>
              current.phase === "installing" ? { ...current, progress } : current,
            );
          }
          timer = setTimeout(read, UPDATE_PROGRESS_INTERVAL_MS);
        },
        () => {
          // O andamento é só informativo: tenta de novo no próximo intervalo.
          if (active) timer = setTimeout(read, UPDATE_PROGRESS_INTERVAL_MS);
        },
      );
    };
    read();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [installing]);

  return { state, check, install };
}
