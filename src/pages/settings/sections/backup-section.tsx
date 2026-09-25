import { DatabaseBackup, FolderOpen, HardDriveDownload, Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { formatBytes, formatDateTime } from "@/lib/format";
import { createDatabaseBackup, listDatabaseBackups } from "@/services/backup-service";
import { toServiceError } from "@/services/tauri/errors";
import { type BackupOverview } from "@/types/backup";

/** Quantos backups mostrar na lista (os demais continuam na pasta). */
const VISIBLE_BACKUPS = 10;

export function BackupSection() {
  const overview = useAsyncResource(listDatabaseBackups);
  const [creating, setCreating] = useState(false);

  const createBackup = async () => {
    setCreating(true);
    try {
      const file = await createDatabaseBackup();
      toast.success("Backup criado", {
        description: `${file.fileName} (${formatBytes(file.sizeBytes)})`,
      });
    } catch (error) {
      toast.error("Não foi possível criar o backup", {
        description: toServiceError(error).message,
      });
    } finally {
      setCreating(false);
      overview.reload();
    }
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Backup do banco de dados</CardTitle>
          <CardDescription>
            Cria uma cópia completa e verificada de todos os seus dados. Os backups nunca são
            sobrescritos nem apagados pelo app.
          </CardDescription>
        </div>
        <Button
          onClick={() => {
            void createBackup();
          }}
          disabled={creating || overview.status !== "success"}
        >
          <HardDriveDownload aria-hidden="true" />
          {creating ? "Criando backup…" : "Fazer backup agora"}
        </Button>
      </CardHeader>
      <CardContent>
        <ResourceView resource={overview} className="py-6">
          {(data) => <BackupDetails overview={data} />}
        </ResourceView>
      </CardContent>
    </Card>
  );
}

function BackupDetails({ overview }: { overview: BackupOverview }) {
  const visible = overview.backups.slice(0, VISIBLE_BACKUPS);
  const hidden = overview.backups.length - visible.length;

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="size-4" aria-hidden="true" />
          Pasta dos backups
        </span>
        <span className="font-mono text-sm break-all" data-selectable>
          {overview.directory}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={DatabaseBackup}
          title="Nenhum backup ainda"
          description="Faça o primeiro backup antes de começar a registrar dados importantes."
          className="py-6"
        />
      ) : (
        <ul className="grid gap-1.5" aria-label="Backups existentes">
          {visible.map((backup) => (
            <li
              key={backup.fileName}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-raised/40 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-xs" data-selectable>
                {backup.fileName}
              </span>
              <span className="text-muted-foreground">{formatDateTime(backup.createdAt)}</span>
              <span className="w-16 text-right font-mono text-xs text-muted-foreground tabular">
                {formatBytes(backup.sizeBytes)}
              </span>
            </li>
          ))}
          {hidden > 0 && (
            <li className="px-3 text-xs text-muted-foreground">
              E mais {hidden} {hidden === 1 ? "backup antigo" : "backups antigos"} na pasta.
            </li>
          )}
        </ul>
      )}

      <p className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        <span>
          Para restaurar: feche o app e substitua o arquivo do banco (caminho em Configurações ›
          Sobre) pela cópia escolhida, renomeada para <code>zona-de-controle.db</code>. Apague os
          arquivos <code>-wal</code> e <code>-shm</code> que estiverem ao lado dele.
        </span>
      </p>
    </div>
  );
}
