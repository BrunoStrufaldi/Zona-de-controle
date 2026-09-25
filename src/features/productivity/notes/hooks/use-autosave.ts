import { useCallback, useEffect, useRef, useState } from "react";

import { type ServiceError, toServiceError } from "@/services/tauri/errors";

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/** Espera após a última alteração antes de salvar. */
export const AUTOSAVE_DELAY_MS = 800;

interface AutosaveOptions<T> {
  /** Persiste o valor. Nunca é chamada em paralelo consigo mesma. */
  persist: (value: T) => Promise<unknown>;
  delayMs?: number;
}

/**
 * Salvamento automático com debounce e fila: alterações feitas durante um
 * salvamento são salvas logo em seguida; ao desmontar (trocar de nota), o que
 * estiver pendente é salvo imediatamente. Em caso de erro, o valor continua
 * pendente e `retry` tenta de novo.
 */
export function useAutosave<T>({ persist, delayMs = AUTOSAVE_DELAY_MS }: AutosaveOptions<T>) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<ServiceError | null>(null);
  const persistRef = useRef(persist);
  const pending = useRef<{ value: T } | null>(null);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  const run = useCallback(async () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // Um salvamento em andamento já vai pegar o valor pendente ao terminar.
    if (saving.current) return;

    // Lidos por funções: o valor pode mudar durante o `await`.
    const takePending = () => {
      const next = pending.current;
      pending.current = null;
      return next;
    };
    const keepPending = (item: { value: T }) => {
      pending.current ??= item;
    };

    saving.current = true;
    try {
      for (let next = takePending(); next !== null; next = takePending()) {
        setStatus("saving");
        try {
          await persistRef.current(next.value);
          setError(null);
          setStatus("saved");
        } catch (caught) {
          // Mantém o valor (ou o mais novo, se houver) para tentar de novo.
          keepPending(next);
          setError(toServiceError(caught));
          setStatus("error");
          return;
        }
      }
    } finally {
      saving.current = false;
    }
  }, []);

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      setStatus("pending");
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void run();
      }, delayMs);
    },
    [delayMs, run],
  );

  const flush = useCallback(() => run(), [run]);

  // Ao desmontar, salva o que estiver pendente.
  useEffect(
    () => () => {
      void run();
    },
    [run],
  );

  return { status, error, schedule, flush, retry: flush };
}
