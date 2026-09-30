import { File } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CopyPathButton } from "@/features/system/disk-usage/components/copy-path-button";
import { splitPath } from "@/features/system/disk-usage/domain/disk-usage";
import { type LargeFile } from "@/features/system/disk-usage/types";
import { formatBytes, formatDate } from "@/lib/format";

/** Os maiores arquivos da unidade, pelo espaço em disco. */
export function LargestFiles({ files }: { files: LargeFile[] }) {
  if (files.length === 0) {
    return <EmptyState icon={File} title="Nenhum arquivo encontrado" />;
  }
  return (
    <div className="@container overflow-hidden rounded-lg border border-border bg-card">
      <Table aria-label="Maiores arquivos">
        <TableHeader>
          <TableRow>
            <TableHead className="w-full">Arquivo</TableHead>
            <TableHead className="text-right whitespace-nowrap">Em disco</TableHead>
            <TableHead className="hidden text-right whitespace-nowrap @2xl:table-cell">
              Tamanho
            </TableHead>
            <TableHead className="hidden text-right whitespace-nowrap @2xl:table-cell">
              Modificado
            </TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((file) => {
            const { name, folder } = splitPath(file.path);
            return (
              <TableRow key={file.path}>
                <TableCell className="w-full max-w-0">
                  <span className="block truncate font-medium" title={name}>
                    {name}
                  </span>
                  <span
                    className="block truncate font-mono text-xs text-subtle-foreground"
                    title={folder}
                    data-selectable
                  >
                    {folder}
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium whitespace-nowrap tabular">
                  {formatBytes(file.allocatedBytes)}
                </TableCell>
                <TableCell className="hidden text-right whitespace-nowrap text-muted-foreground tabular @2xl:table-cell">
                  {formatBytes(file.bytes)}
                </TableCell>
                <TableCell className="hidden text-right whitespace-nowrap text-muted-foreground tabular @2xl:table-cell">
                  {file.modifiedMs === null ? "" : formatDate(file.modifiedMs)}
                </TableCell>
                <TableCell>
                  <CopyPathButton path={file.path} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
