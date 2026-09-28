import { useCallback, useState } from "react";

import {
  appendSample,
  MONITOR_INTERVAL_MS,
  toUsageSample,
  type UsageSample,
} from "@/features/system/domain/history";
import { type SystemSnapshot } from "@/features/system/types";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { usePollingResource } from "@/hooks/use-polling-resource";
import { getSystemSnapshot } from "@/services/system-service";

interface SystemMonitorState {
  snapshot: AsyncResource<SystemSnapshot>;
  /** Leituras desta visita à tela (não são gravadas em lugar nenhum). */
  history: UsageSample[];
}

/** Lê CPU, memória e discos a cada 2 s e guarda os últimos 2 minutos para os gráficos. */
export function useSystemMonitor({ paused }: { paused: boolean }): SystemMonitorState {
  const [history, setHistory] = useState<UsageSample[]>([]);

  const load = useCallback(async () => {
    const snapshot = await getSystemSnapshot();
    const sample = toUsageSample(snapshot, Date.now());
    setHistory((current) => appendSample(current, sample));
    return snapshot;
  }, []);

  const snapshot = usePollingResource(load, { intervalMs: MONITOR_INTERVAL_MS, paused });
  return { snapshot, history };
}
