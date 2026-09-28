import { useCallback, useEffect, useRef, useState } from "react";

import { type CleanupItem, type CleanupSource } from "@/features/system/optimization/types";
import { listCleanupItems } from "@/services/optimization-service";
import { type ServiceError, toServiceError } from "@/services/tauri/errors";

/** Itens por página (o Rust aceita até 200). */
export const CLEANUP_ITEMS_PAGE_SIZE = 100;

interface CleanupItemsState {
  items: CleanupItem[];
  /** `null` até a primeira página chegar. */
  total: number | null;
  loading: boolean;
  error: ServiceError | null;
}

export interface CleanupItems extends CleanupItemsState {
  hasMore: boolean;
  loadMore: () => void;
}

/** Itens de uma origem da análise, maiores primeiro, carregados por página. */
export function useCleanupItems(scanId: number, source: CleanupSource): CleanupItems {
  const [state, setState] = useState<CleanupItemsState>({
    items: [],
    total: null,
    loading: true,
    error: null,
  });
  const active = useRef(true);

  const fetchPage = useCallback(
    (offset: number) => {
      listCleanupItems(scanId, source, offset, CLEANUP_ITEMS_PAGE_SIZE).then(
        (page) => {
          if (!active.current) return;
          setState((previous) => ({
            items: [...previous.items.slice(0, offset), ...page.items],
            total: page.total,
            loading: false,
            error: null,
          }));
        },
        (error: unknown) => {
          if (!active.current) return;
          setState((previous) => ({ ...previous, loading: false, error: toServiceError(error) }));
        },
      );
    },
    [scanId, source],
  );

  useEffect(() => {
    active.current = true;
    fetchPage(0);
    return () => {
      active.current = false;
    };
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    setState((previous) => ({ ...previous, loading: true, error: null }));
    fetchPage(state.items.length);
  }, [fetchPage, state.items.length]);

  return {
    ...state,
    hasMore: state.total !== null && state.items.length < state.total,
    loadMore,
  };
}
