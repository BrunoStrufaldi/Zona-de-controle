import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  LoaderCircle,
  Lock,
  MoreHorizontal,
  RotateCw,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyPathButton } from "@/features/system/disk-usage/components/copy-path-button";
import {
  filesLabel,
  restLabel,
  shareLabel,
  shareOfParent,
} from "@/features/system/disk-usage/domain/disk-usage";
import {
  type TreeKey,
  type TreeRow,
  treeKeyAction,
} from "@/features/system/disk-usage/domain/tree";
import { type FolderTree, useFolderTree } from "@/features/system/disk-usage/hooks/use-folder-tree";
import { type DiskUsageScan } from "@/features/system/disk-usage/types";
import { cn } from "@/lib/cn";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";

/** Colunas: nome, parte da pasta de cima, em disco e, com espaço, tamanho, arquivos e data. */
const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_6.5rem_5rem] items-center gap-x-3 @3xl:grid-cols-[minmax(0,1fr)_9rem_5.5rem_5.5rem_6.5rem_6rem]";
const WIDE_ONLY = "hidden @3xl:block";

const TREE_KEYS: ReadonlySet<string> = new Set<TreeKey>([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
]);

function isTreeKey(key: string): key is TreeKey {
  return TREE_KEYS.has(key);
}

/** Árvore de pastas da análise, maiores primeiro (como no WinDirStat). */
export function FolderTreeView({ scan }: { scan: DiskUsageScan }) {
  const tree = useFolderTree(scan);
  const { rows } = tree;
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const selected = rows.find((row) => row.key === focusedKey) ?? rows[0];
  const rowElements = useRef(new Map<string, HTMLDivElement>());
  // Só move o foco do navegador quando a seleção mudou pelo teclado.
  const focusPending = useRef(false);

  useEffect(() => {
    if (!focusPending.current || !selected) return;
    focusPending.current = false;
    rowElements.current.get(selected.key)?.focus();
  }, [selected]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selected) return;
    if ((event.key === "Enter" || event.key === " ") && selected.kind === "entry") {
      const folderId = selected.entry.folderId;
      if (folderId !== null && selected.entry.hasChildren) {
        event.preventDefault();
        tree.toggle(folderId);
      }
      return;
    }
    if (!isTreeKey(event.key)) return;
    event.preventDefault();
    const action = treeKeyAction(rows, selected.key, event.key);
    if (action?.type === "focus") {
      focusPending.current = true;
      setFocusedKey(action.key);
    } else if (action?.type === "expand") {
      tree.expand(action.folderId);
    } else if (action?.type === "collapse") {
      tree.collapse(action.folderId);
    }
  };

  return (
    <div className="@container overflow-hidden rounded-lg border border-border bg-card">
      <div
        className={cn(
          COLUMNS,
          "border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground",
        )}
        aria-hidden="true"
      >
        <span>Nome</span>
        <span>% da pasta</span>
        <span className="text-right">Em disco</span>
        <span className={cn(WIDE_ONLY, "text-right")}>Tamanho</span>
        <span className={cn(WIDE_ONLY, "text-right")}>Arquivos</span>
        <span className={cn(WIDE_ONLY, "text-right")}>Modificado</span>
      </div>
      <div
        role="tree"
        aria-label={`Pastas de ${scan.root.name}`}
        className="max-h-[36rem] overflow-y-auto py-1"
        onKeyDown={onKeyDown}
      >
        {rows.map((row) => (
          <TreeRowView
            key={row.key}
            row={row}
            selected={row.key === selected?.key}
            tree={tree}
            elementRef={(element) => {
              if (element) rowElements.current.set(row.key, element);
              else rowElements.current.delete(row.key);
            }}
            onSelect={() => {
              setFocusedKey(row.key);
            }}
          />
        ))}
      </div>
      {selected?.kind === "entry" && (
        <div className="flex items-center gap-2 border-t border-border px-3 py-2">
          <span
            className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
            title={selected.path}
            data-selectable
          >
            {selected.path}
          </span>
          <CopyPathButton path={selected.path} />
        </div>
      )}
    </div>
  );
}

interface TreeRowViewProps {
  row: TreeRow;
  selected: boolean;
  tree: FolderTree;
  elementRef: (element: HTMLDivElement | null) => void;
  onSelect: () => void;
}

function TreeRowView({ row, selected, tree, elementRef, onSelect }: TreeRowViewProps) {
  const indent = { paddingLeft: `${row.depth * 1.25 + 0.25}rem` };
  const common = {
    ref: elementRef,
    role: "treeitem",
    "aria-level": row.depth + 1,
    "aria-selected": selected,
    tabIndex: selected ? 0 : -1,
    onClick: onSelect,
    onFocus: onSelect,
    className: cn(
      COLUMNS,
      "mx-1 min-h-8 cursor-default rounded-md px-2 py-1 text-sm outline-none",
      "hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring",
      selected && "bg-primary/10 hover:bg-primary/15",
    ),
  } as const;

  if (row.kind === "loading") {
    return (
      <div {...common} aria-label="Carregando…">
        <span className="flex items-center gap-2 text-muted-foreground" style={indent}>
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Carregando…
        </span>
      </div>
    );
  }

  if (row.kind === "error") {
    return (
      <div {...common} aria-label={`Erro ao abrir a pasta: ${row.message}`}>
        <span className="flex min-w-0 items-center gap-2 text-danger" style={indent}>
          <span className="truncate">{row.message}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0"
            tabIndex={-1}
            onClick={() => {
              tree.retry(row.folderId);
            }}
          >
            <RotateCw aria-hidden="true" />
            Tentar de novo
          </Button>
        </span>
      </div>
    );
  }

  if (row.kind === "rest") {
    const share = shareOfParent(row.rest.allocatedBytes, row.parentAllocatedBytes);
    return (
      <div
        {...common}
        aria-label={`${restLabel(row.rest)}: ${formatBytes(row.rest.allocatedBytes)} em disco (${shareLabel(share)} da pasta)`}
      >
        <span className="flex min-w-0 items-center gap-2 text-muted-foreground" style={indent}>
          <span className="size-4 shrink-0" aria-hidden="true" />
          <MoreHorizontal className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate italic">{restLabel(row.rest)}</span>
        </span>
        <ShareBar share={share} />
        <span className="text-right text-muted-foreground tabular">
          {formatBytes(row.rest.allocatedBytes)}
        </span>
        <span className={cn(WIDE_ONLY, "text-right text-muted-foreground tabular")}>
          {formatBytes(row.rest.bytes)}
        </span>
        <span className={WIDE_ONLY} />
        <span className={WIDE_ONLY} />
      </div>
    );
  }

  const { entry } = row;
  const folderId = entry.folderId;
  const expandable = folderId !== null && entry.hasChildren;
  const share = shareOfParent(entry.allocatedBytes, row.parentAllocatedBytes);
  const Icon =
    folderId === null ? File : entry.unreadable ? Lock : row.expanded ? FolderOpen : Folder;
  const toggle = () => {
    if (expandable) tree.toggle(folderId);
  };

  return (
    <div
      {...common}
      aria-expanded={expandable ? row.expanded : undefined}
      aria-label={`${entry.name}: ${formatBytes(entry.allocatedBytes)} em disco (${shareLabel(share)} ${row.depth === 0 ? "do espaço em uso" : "da pasta"})${entry.unreadable ? ", sem acesso" : ""}`}
      onDoubleClick={toggle}
    >
      <span className="flex min-w-0 items-center gap-1.5" style={indent}>
        {expandable ? (
          <span
            className="grid size-4 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground hover:text-foreground"
            aria-hidden="true"
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
              toggle();
            }}
          >
            <ChevronRight
              className={cn("size-4 transition-transform", row.expanded && "rotate-90")}
            />
          </span>
        ) : (
          <span className="size-4 shrink-0" aria-hidden="true" />
        )}
        <Icon
          className={cn(
            "size-4 shrink-0",
            folderId === null ? "text-muted-foreground" : "text-primary",
            entry.unreadable && "text-warning",
          )}
          aria-hidden="true"
        />
        <span className="truncate" title={entry.name}>
          {entry.name}
        </span>
        {entry.unreadable && (
          <Badge variant="warning" className="shrink-0">
            Sem acesso
          </Badge>
        )}
      </span>
      <ShareBar share={share} />
      <span className="text-right font-medium tabular">{formatBytes(entry.allocatedBytes)}</span>
      <span className={cn(WIDE_ONLY, "text-right text-muted-foreground tabular")}>
        {formatBytes(entry.bytes)}
      </span>
      <span
        className={cn(WIDE_ONLY, "text-right text-muted-foreground tabular")}
        title={entry.files === null ? undefined : filesLabel(entry.files)}
      >
        {entry.files === null ? "" : formatNumber(entry.files, 0)}
      </span>
      <span className={cn(WIDE_ONLY, "text-right text-muted-foreground tabular")}>
        {entry.modifiedMs === null ? "" : formatDate(entry.modifiedMs)}
      </span>
    </div>
  );
}

function ShareBar({ share }: { share: number }) {
  return (
    <span className="flex items-center gap-2" aria-hidden="true">
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${share * 100}%` }}
        />
      </span>
      <span className="w-10 text-right text-xs text-muted-foreground tabular">
        {shareLabel(share)}
      </span>
    </span>
  );
}
