import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CHILDREN_LIMIT } from "@/features/system/disk-usage/domain/disk-usage";
import {
  type ChildrenState,
  type TreeRow,
  visibleRows,
} from "@/features/system/disk-usage/domain/tree";
import { type DiskUsageScan } from "@/features/system/disk-usage/types";
import { listDiskUsageChildren } from "@/services/disk-usage-service";
import { toServiceError } from "@/services/tauri/errors";

export interface FolderTree {
  rows: TreeRow[];
  expand: (folderId: number) => void;
  collapse: (folderId: number) => void;
  toggle: (folderId: number) => void;
  /** Tenta de novo abrir uma pasta que deu erro. */
  retry: (folderId: number) => void;
}

/**
 * Pastas abertas da árvore de uma análise. O conteúdo de cada pasta é pedido
 * ao Rust na primeira vez que ela é aberta e guardado (a análise não muda).
 * Monte com `key={scan.id}`: outra análise começa do zero.
 */
export function useFolderTree(scan: DiskUsageScan): FolderTree {
  const rootId = scan.root.folderId;
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(
    () => new Set(rootId === null ? [] : [rootId]),
  );
  const [children, setChildren] = useState<ReadonlyMap<number, ChildrenState>>(() => new Map());
  // Pedidos já feitos, para não repetir (o estado pode não ter sido atualizado ainda).
  const requested = useRef(new Set<number>());

  const load = useCallback(
    (folderId: number) => {
      if (requested.current.has(folderId)) return;
      requested.current.add(folderId);
      setChildren((current) => new Map(current).set(folderId, { status: "loading" }));
      listDiskUsageChildren(scan.id, folderId, CHILDREN_LIMIT).then(
        (data) => {
          setChildren((current) => new Map(current).set(folderId, { status: "success", data }));
        },
        (error: unknown) => {
          requested.current.delete(folderId);
          setChildren((current) =>
            new Map(current).set(folderId, {
              status: "error",
              message: toServiceError(error).message,
            }),
          );
        },
      );
    },
    [scan.id],
  );

  // A raiz já vem aberta.
  useEffect(() => {
    if (rootId !== null) load(rootId);
  }, [load, rootId]);

  const expand = useCallback(
    (folderId: number) => {
      load(folderId);
      setExpanded((current) => new Set(current).add(folderId));
    },
    [load],
  );

  const collapse = useCallback((folderId: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      next.delete(folderId);
      return next;
    });
  }, []);

  const toggle = useCallback(
    (folderId: number) => {
      if (expanded.has(folderId)) collapse(folderId);
      else expand(folderId);
    },
    [collapse, expand, expanded],
  );

  const rows = useMemo(
    () => visibleRows(scan.root, scan.volumeUsedBytes, expanded, children),
    [scan.root, scan.volumeUsedBytes, expanded, children],
  );

  return { rows, expand, collapse, toggle, retry: load };
}
