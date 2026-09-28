import { useCallback, useEffect, useMemo, useState } from "react";

import { type AsyncResource, type AsyncResourceState } from "@/hooks/use-async-resource";
import { toServiceError } from "@/services/tauri/errors";

/** Mudança local aplicada antes da resposta do backend (ou `null`). */
export type Optimistic<T> = ((data: T) => T) | null;

export type Mutate<T> = <R>(optimistic: Optimistic<T>, action: () => Promise<R>) => Promise<R>;

/**
 * Como `useAsyncResource`, com mutações: `mutate` aplica a mudança otimista,
 * executa a ação e recarrega do banco em seguida (o que também desfaz a
 * mudança local se o backend falhar). Erros são relançados como `ServiceError`.
 * Trocar `load` (ex.: outro período) recarrega mantendo os dados atuais na tela.
 * `load` deve ser estável (função de módulo ou memoizada com `useCallback`).
 */
export function useMutableResource<T>(load: () => Promise<T>): {
  resource: AsyncResource<T>;
  mutate: Mutate<T>;
} {
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

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    refresh();
  }, [refresh]);

  const mutate = useCallback<Mutate<T>>(
    async (optimistic, action) => {
      if (optimistic) {
        setState((current) =>
          current.status === "success" ? { ...current, data: optimistic(current.data) } : current,
        );
      }
      try {
        return await action();
      } catch (error) {
        throw toServiceError(error);
      } finally {
        refresh();
      }
    },
    [refresh],
  );

  const resource = useMemo(() => ({ ...state, reload }), [state, reload]);
  return { resource, mutate };
}
