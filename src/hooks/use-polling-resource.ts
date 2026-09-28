import { useCallback, useEffect, useState } from "react";

import { type AsyncResource, type AsyncResourceState } from "@/hooks/use-async-resource";
import { useDocumentVisible } from "@/hooks/use-document-visible";
import { toServiceError } from "@/services/tauri/errors";

interface PollingOptions {
  /** Intervalo entre o fim de uma leitura e o início da próxima. */
  intervalMs: number;
  /** Pausa as leituras (mantém o último dado na tela). */
  paused?: boolean;
}

/**
 * Como `useAsyncResource`, mas relê o recurso periodicamente. Nunca há duas
 * leituras simultâneas (a próxima só é agendada quando a anterior termina), as
 * releituras não voltam para "carregando" e nada é lido com a janela oculta.
 * Um erro interrompe as leituras até `reload()`.
 * `load` deve ser estável (função de módulo ou memoizada com `useCallback`).
 */
export type PollingResource<T> = AsyncResource<T> & {
  /** Relê agora mantendo o dado atual na tela (ex.: depois de uma alteração). */
  refresh: () => void;
};

export function usePollingResource<T>(
  load: () => Promise<T>,
  { intervalMs, paused = false }: PollingOptions,
): PollingResource<T> {
  const [state, setState] = useState<AsyncResourceState<T>>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const visible = useDocumentVisible();

  useEffect(() => {
    if (paused || !visible) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const read = () => {
      load().then(
        (data) => {
          if (!active) return;
          setState({ status: "success", data });
          timer = setTimeout(read, intervalMs);
        },
        (error: unknown) => {
          if (active) setState({ status: "error", error: toServiceError(error) });
        },
      );
    };
    read();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [load, intervalMs, paused, visible, reloadToken]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setReloadToken((token) => token + 1);
  }, []);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  return { ...state, reload, refresh };
}
