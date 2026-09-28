import { FolderOpen } from "lucide-react";

import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { itemCountLabel, sourceInfo } from "@/features/system/optimization/domain/cleanup";
import { useCleanupItems } from "@/features/system/optimization/hooks/use-cleanup-items";
import { type SourceSummary } from "@/features/system/optimization/types";
import { formatBytes, formatDateTime, formatNumber } from "@/lib/format";

interface CleanupItemsDialogProps {
  scanId: number;
  /** Origem aberta; `null` fecha o diálogo. */
  summary: SourceSummary | null;
  onClose: () => void;
}

/** Lista exata do que a análise encontrou numa origem, maiores primeiro. */
export function CleanupItemsDialog({ scanId, summary, onClose }: CleanupItemsDialogProps) {
  return (
    <Dialog
      open={summary !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-3xl">
        {summary && <ItemsContent key={summary.source} scanId={scanId} summary={summary} />}
      </DialogContent>
    </Dialog>
  );
}

function ItemsContent({ scanId, summary }: { scanId: number; summary: SourceSummary }) {
  const { items, total, loading, error, hasMore, loadMore } = useCleanupItems(
    scanId,
    summary.source,
  );
  const deleted = summary.source === "recycleBin";

  return (
    <>
      <DialogHeader>
        <DialogTitle>{sourceInfo[summary.source].name}</DialogTitle>
        <DialogDescription>
          {itemCountLabel(summary.source, summary.itemCount)} · {formatBytes(summary.totalBytes)}.
          Maiores primeiro. Nada é removido nesta tela.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1 text-xs text-subtle-foreground">
        <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
          <FolderOpen className="size-3.5" aria-hidden="true" />
          {summary.folders.length === 1 ? "Pasta analisada" : "Pastas analisadas"}
        </span>
        <ul className="grid max-h-24 gap-0.5 overflow-y-auto font-mono" data-selectable>
          {summary.folders.map((folder) => (
            <li key={folder} className="break-all">
              {folder}
            </li>
          ))}
        </ul>
      </div>

      <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card text-left text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-3 py-2 font-medium">{deleted ? "Local original" : "Arquivo"}</th>
              <th className="px-3 py-2 text-right font-medium">Tamanho</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">
                {deleted ? "Excluído em" : "Modificado em"}
              </th>
            </tr>
          </thead>
          <tbody data-selectable>
            {items.map((item) => (
              <tr key={item.path} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-1.5 font-mono break-all">{item.path}</td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">
                  {formatBytes(item.bytes)}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground tabular-nums">
                  {item.dateMs === null ? "—" : formatDateTime(item.dateMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <LoadingState label="Carregando itens…" className="py-6" />}
        {error && <ErrorState message={error.message} onRetry={loadMore} className="m-3 py-6" />}
      </div>

      {total !== null && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span role="status">
            Mostrando {formatNumber(items.length)} de {itemCountLabel(summary.source, total)}
          </span>
          {hasMore && !loading && !error && (
            <Button variant="secondary" size="sm" onClick={loadMore}>
              Carregar mais
            </Button>
          )}
        </div>
      )}
    </>
  );
}
