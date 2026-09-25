import { useCallback, useEffect, useState } from "react";

import { type ServiceError, toServiceError } from "@/services/tauri/errors";

export type AsyncResourceState<T> =
  { status: "loading" } | { status: "success"; data: T } | { status: "error"; error: ServiceError };

export type AsyncResource<T> = AsyncResourceState<T> & {
  /** Recarrega o recurso. */
  reload: () => void;
};

/**
 * Carrega um recurso assíncrono (normalmente uma função de `src/services`).
 * `load` deve ser estável (função de módulo ou memoizada com `useCallback`).
 */
export function useAsyncResource<T>(load: () => Promise<T>): AsyncResource<T> {
  const [state, setState] = useState<AsyncResourceState<T>>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    load().then(
      (data) => {
        if (active) setState({ status: "success", data });
      },
      (error: unknown) => {
        if (active) setState({ status: "error", error: toServiceError(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [load, reloadToken]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setReloadToken((token) => token + 1);
  }, []);

  return { ...state, reload };
}
