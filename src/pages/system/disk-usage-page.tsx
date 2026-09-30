import { FolderTree, HardDrive } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router";

import { DISK_USAGE_DRIVE_PARAM } from "@/app/router/paths";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { PageHeader } from "@/components/shared/page-header";
import { ResourceView } from "@/components/shared/resource-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DriveList } from "@/features/system/disk-usage/components/drive-list";
import { FolderTreeView } from "@/features/system/disk-usage/components/folder-tree";
import { LargestFiles } from "@/features/system/disk-usage/components/largest-files";
import { ScanProgressCard } from "@/features/system/disk-usage/components/scan-progress-card";
import { ScanSummaryCard } from "@/features/system/disk-usage/components/scan-summary-card";
import {
  type DiskUsageState,
  useDiskUsageScan,
} from "@/features/system/disk-usage/hooks/use-disk-usage-scan";
import { type DiskUsageScan } from "@/features/system/disk-usage/types";
import { type DiskUsage } from "@/features/system/types";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { getSystemSnapshot } from "@/services/system-service";

export function DiskUsagePage() {
  const { state, start, cancel } = useDiskUsageScan();
  const snapshot = useAsyncResource(getSystemSnapshot);
  const disks = snapshot.status === "success" ? snapshot.data.disks : [];
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get(DISK_USAGE_DRIVE_PARAM);
  // Unidade da análise na tela (a anterior, enquanto uma nova roda).
  const shown =
    state.phase === "ready" ? state.scan : state.phase === "running" ? state.previous : null;
  const analyzed = shown?.mountPoint ?? null;

  // Vindo do card Armazenamento (`?drive=C:`): analisa a unidade, a não ser
  // que a análise mostrada já seja dela.
  useEffect(() => {
    if (requested === null || state.phase !== "ready" || snapshot.status !== "success") return;
    setSearchParams({}, { replace: true });
    const exists = snapshot.data.disks.some((disk) => disk.mountPoint === requested);
    if (exists && analyzed !== requested) start(requested);
  }, [analyzed, requested, setSearchParams, snapshot, start, state.phase]);

  return (
    <>
      <PageHeader
        title="Espaço em disco"
        description="O que ocupa cada unidade, pasta por pasta, e os maiores arquivos. Só leitura: nada é aberto, alterado ou removido."
        icon={FolderTree}
      />
      <div className="@container grid gap-6">
        <ResourceView resource={snapshot} loadingLabel="Lendo as unidades…">
          {(data) =>
            data.disks.length === 0 ? (
              <EmptyState icon={HardDrive} title="Nenhuma unidade encontrada" />
            ) : (
              <DriveList
                disks={data.disks}
                analyzedMountPoint={analyzed}
                busy={state.phase === "running" || state.phase === "loading"}
                onAnalyze={start}
              />
            )
          }
        </ResourceView>
        <ScanArea state={state} disks={disks} onCancel={cancel} />
      </div>
    </>
  );
}

interface ScanAreaProps {
  state: DiskUsageState;
  disks: DiskUsage[];
  onCancel: () => void;
}

function ScanArea({ state, disks, onCancel }: ScanAreaProps) {
  switch (state.phase) {
    case "loading":
      return <LoadingState />;
    case "failed":
      // Fora do app desktop, a lista de unidades já mostra o aviso.
      return state.error.kind === "desktop-only" ? null : (
        <ErrorState title="Não foi possível ler a análise" message={state.error.message} />
      );
    case "running": {
      const disk = disks.find((candidate) => candidate.mountPoint === state.mountPoint);
      return (
        <ScanProgressCard
          mountPoint={state.mountPoint}
          progress={state.progress}
          volumeUsedBytes={disk?.usedBytes ?? null}
          cancelRequested={state.cancelRequested}
          onCancel={onCancel}
        />
      );
    }
    case "ready":
      return (
        <>
          {state.error && (
            <ErrorState title="A análise não foi concluída" message={state.error.message} />
          )}
          {state.scan ? (
            <ScanResult key={state.scan.id} scan={state.scan} />
          ) : (
            !state.error && (
              <EmptyState
                icon={FolderTree}
                title="Escolha uma unidade para analisar"
                description="A análise lê o nome, o tamanho e a data de cada arquivo, sem abrir nenhum. O resultado fica só na memória enquanto o app está aberto."
              />
            )
          )}
        </>
      );
  }
}

function ScanResult({ scan }: { scan: DiskUsageScan }) {
  return (
    <div className="grid gap-6">
      <ScanSummaryCard scan={scan} />
      <Tabs defaultValue="folders" className="gap-4">
        <TabsList aria-label="Visão">
          <TabsTrigger value="folders">Pastas</TabsTrigger>
          <TabsTrigger value="largest">Maiores arquivos</TabsTrigger>
        </TabsList>
        <TabsContent value="folders">
          <FolderTreeView scan={scan} />
        </TabsContent>
        <TabsContent value="largest">
          <LargestFiles files={scan.largestFiles} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
