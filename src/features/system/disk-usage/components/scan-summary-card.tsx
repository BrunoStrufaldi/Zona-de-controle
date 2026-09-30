import { Info } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  filesLabel,
  foldersLabel,
  scanDurationLabel,
  scanNotes,
  volumeSegments,
} from "@/features/system/disk-usage/domain/disk-usage";
import { type DiskUsageScan } from "@/features/system/disk-usage/types";
import { cn } from "@/lib/cn";
import { formatBytes, formatDateTime, formatPercent } from "@/lib/format";
import { safeRatio } from "@/lib/math";

const SEGMENT_CLASSES = {
  scanned: "bg-primary",
  unaccounted: "bg-muted-foreground/60",
  free: "bg-raised",
} as const;

/** Resumo da análise: quanto está nas pastas, o que não foi identificado e o livre. */
export function ScanSummaryCard({ scan }: { scan: DiskUsageScan }) {
  const segments = volumeSegments(scan);
  const parts = [
    { id: "scanned", label: "Nas pastas", bytes: segments.scannedBytes },
    { id: "unaccounted", label: "Não identificado", bytes: segments.unaccountedBytes },
    { id: "free", label: "Livre", bytes: segments.freeBytes },
  ] as const;
  const notes = scanNotes(scan);

  return (
    <Card className="animate-fade-in">
      <CardHeader className="flex-wrap gap-2">
        <CardTitle>
          <span className="font-mono">{scan.root.name}</span> · {scan.fileSystem}
        </CardTitle>
        <span className="text-xs text-subtle-foreground">
          Análise de {formatDateTime(scan.finishedAtMs)} · levou{" "}
          {scanDurationLabel(scan.durationMs)}
        </span>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div
          className="flex h-3 overflow-hidden rounded-full bg-raised"
          role="img"
          aria-label={parts.map((part) => `${part.label}: ${formatBytes(part.bytes)}`).join(", ")}
        >
          {parts.map((part) => (
            <div
              key={part.id}
              className={cn("h-full", SEGMENT_CLASSES[part.id])}
              style={{ width: `${safeRatio(part.bytes, segments.totalBytes) * 100}%` }}
            />
          ))}
        </div>
        <dl className="grid gap-3 text-sm @xl:grid-cols-4">
          {parts.map((part) => (
            <div key={part.id} className="grid gap-0.5">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "size-2.5 rounded-sm border border-border",
                    SEGMENT_CLASSES[part.id],
                  )}
                  aria-hidden="true"
                />
                {part.label}
              </dt>
              <dd className="font-medium tabular">
                {formatBytes(part.bytes)}{" "}
                <span className="text-xs font-normal text-subtle-foreground">
                  {formatPercent(safeRatio(part.bytes, segments.totalBytes), 0)}
                </span>
              </dd>
            </div>
          ))}
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">Conteúdo</dt>
            <dd className="font-medium tabular">
              {filesLabel(scan.totals.files)}
              <span className="block text-xs font-normal text-subtle-foreground">
                em {foldersLabel(scan.totals.folders)}
              </span>
            </dd>
          </div>
        </dl>
        {notes.length > 0 && (
          <ul className="grid gap-1.5 text-xs text-muted-foreground" aria-label="Observações">
            {notes.map((note) => (
              <li key={note.id} className="flex gap-2">
                <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden="true" />
                <span>{note.text}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
