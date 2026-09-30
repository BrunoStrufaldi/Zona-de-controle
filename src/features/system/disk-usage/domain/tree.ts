import { joinPath } from "@/features/system/disk-usage/domain/disk-usage";
import {
  type DiskEntry,
  type FolderChildren,
  type HiddenItems,
} from "@/features/system/disk-usage/types";

/** Conteúdo de uma pasta aberta na árvore. */
export type ChildrenState =
  | { status: "loading" }
  | { status: "success"; data: FolderChildren }
  | { status: "error"; message: string };

interface RowBase {
  key: string;
  /** 0 = raiz da unidade. */
  depth: number;
  /** Linha da pasta que contém esta (`null` na raiz). */
  parentKey: string | null;
}

export type TreeRow =
  | (RowBase & {
      kind: "entry";
      entry: DiskEntry;
      path: string;
      /** Espaço da pasta de cima, base do percentual. */
      parentAllocatedBytes: number;
      expanded: boolean;
    })
  | (RowBase & { kind: "loading" })
  | (RowBase & { kind: "error"; folderId: number; message: string })
  | (RowBase & { kind: "rest"; rest: HiddenItems; parentAllocatedBytes: number });

export function folderKey(folderId: number): string {
  return `folder:${folderId}`;
}

function entryKey(parentId: number, entry: DiskEntry): string {
  return entry.folderId === null ? `file:${parentId}:${entry.name}` : folderKey(entry.folderId);
}

/**
 * Linhas visíveis da árvore, na ordem da tela: a raiz e, em cada pasta aberta,
 * o conteúdo dela (ou "carregando"/erro) e os itens menores somados.
 * `volumeUsedBytes` é a base do percentual da raiz.
 */
export function visibleRows(
  root: DiskEntry,
  volumeUsedBytes: number,
  expanded: ReadonlySet<number>,
  children: ReadonlyMap<number, ChildrenState>,
): TreeRow[] {
  const rows: TreeRow[] = [];

  const addEntry = (
    entry: DiskEntry,
    path: string,
    depth: number,
    parentKey: string | null,
    parentAllocatedBytes: number,
    key: string,
  ) => {
    const folderId = entry.folderId;
    const isOpen = folderId !== null && entry.hasChildren && expanded.has(folderId);
    rows.push({
      kind: "entry",
      key,
      depth,
      parentKey,
      entry,
      path,
      parentAllocatedBytes,
      expanded: isOpen,
    });
    if (!isOpen) return;

    const state = children.get(folderId);
    const childDepth = depth + 1;
    if (!state || state.status === "loading") {
      rows.push({ kind: "loading", key: `loading:${folderId}`, depth: childDepth, parentKey: key });
      return;
    }
    if (state.status === "error") {
      rows.push({
        kind: "error",
        key: `error:${folderId}`,
        depth: childDepth,
        parentKey: key,
        folderId,
        message: state.message,
      });
      return;
    }
    for (const child of state.data.entries) {
      addEntry(
        child,
        joinPath(state.data.path, child.name),
        childDepth,
        key,
        entry.allocatedBytes,
        entryKey(folderId, child),
      );
    }
    if (state.data.rest) {
      rows.push({
        kind: "rest",
        key: `rest:${folderId}`,
        depth: childDepth,
        parentKey: key,
        rest: state.data.rest,
        parentAllocatedBytes: entry.allocatedBytes,
      });
    }
  };

  addEntry(
    root,
    root.name,
    0,
    null,
    volumeUsedBytes,
    root.folderId === null ? "root" : folderKey(root.folderId),
  );
  return rows;
}

export type TreeKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";

export type TreeAction =
  | { type: "focus"; key: string }
  | { type: "expand"; folderId: number }
  | { type: "collapse"; folderId: number }
  | null;

/**
 * Teclado da árvore (padrão WAI-ARIA): ↑/↓ movem, → abre a pasta (ou vai para
 * o primeiro item dela), ← fecha (ou volta para a pasta de cima), Home/End.
 */
export function treeKeyAction(rows: TreeRow[], currentKey: string, key: TreeKey): TreeAction {
  const index = rows.findIndex((row) => row.key === currentKey);
  if (index < 0) return rows[0] ? { type: "focus", key: rows[0].key } : null;
  const row = rows[index];
  if (!row) return null;
  const focusAt = (target: number): TreeAction => {
    const next = rows[target];
    return next ? { type: "focus", key: next.key } : null;
  };

  switch (key) {
    case "ArrowDown":
      return focusAt(index + 1);
    case "ArrowUp":
      return focusAt(index - 1);
    case "Home":
      return focusAt(0);
    case "End":
      return focusAt(rows.length - 1);
    case "ArrowRight": {
      if (row.kind !== "entry" || row.entry.folderId === null || !row.entry.hasChildren) {
        return null;
      }
      return row.expanded ? focusAt(index + 1) : { type: "expand", folderId: row.entry.folderId };
    }
    case "ArrowLeft": {
      if (row.kind === "entry" && row.expanded && row.entry.folderId !== null) {
        return { type: "collapse", folderId: row.entry.folderId };
      }
      return row.parentKey ? { type: "focus", key: row.parentKey } : null;
    }
  }
}
