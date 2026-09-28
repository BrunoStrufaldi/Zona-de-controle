import { Activity, Pause, Play } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { ResourceView } from "@/components/shared/resource-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CpuCard } from "@/features/system/components/cpu-card";
import { MemoryCard } from "@/features/system/components/memory-card";
import { ProcessesCard } from "@/features/system/components/processes-card";
import { StorageWidget } from "@/features/system/components/storage-widget";
import { SystemInfoCard } from "@/features/system/components/system-info-card";
import { useSystemMonitor } from "@/features/system/hooks/use-system-monitor";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { usePollingResource } from "@/hooks/use-polling-resource";
import { getSystemInfo, listProcesses } from "@/services/system-service";

/** A lista de processos é a leitura mais cara; não precisa do mesmo ritmo dos gráficos. */
const PROCESSES_INTERVAL_MS = 3_000;

export function MonitorPage() {
  const [paused, setPaused] = useState(false);
  const { snapshot, history } = useSystemMonitor({ paused });
  const processes = usePollingResource(listProcesses, {
    intervalMs: PROCESSES_INTERVAL_MS,
    paused,
  });
  const info = useAsyncResource(getSystemInfo);

  return (
    <>
      <PageHeader
        title="Monitoramento"
        description="Uso de CPU, memória e discos em tempo real. As leituras não são gravadas."
        icon={Activity}
        badges={
          snapshot.status === "success" &&
          (paused ? <Badge>Pausado</Badge> : <Badge variant="success">Ao vivo · a cada 2 s</Badge>)
        }
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              setPaused((current) => !current);
            }}
          >
            {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {paused ? "Retomar" : "Pausar"}
          </Button>
        }
      />

      <ResourceView resource={snapshot} loadingLabel="Lendo o sistema…">
        {(data) => (
          // Colunas pela largura da área de conteúdo (container query), não da janela.
          <div className="@container">
            <div className="grid gap-6 @3xl:grid-cols-2">
              <CpuCard cpu={data.cpu} history={history} />
              <MemoryCard memory={data.memory} history={history} />
              <StorageWidget snapshot={snapshot} />
              <SystemInfoCard info={info} />
              <ProcessesCard processes={processes} className="@3xl:col-span-2" />
            </div>
          </div>
        )}
      </ResourceView>
    </>
  );
}
