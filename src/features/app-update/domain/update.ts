import { formatBytes } from "@/lib/format";
import { type UpdateProgress, type UpdateStage } from "@/types/app";

/** Intervalo entre as consultas de andamento enquanto a atualização roda. */
export const UPDATE_PROGRESS_INTERVAL_MS = 300;

export const updateStageLabels: Record<UpdateStage, string> = {
  backup: "Fazendo backup do banco…",
  downloading: "Baixando a atualização…",
  installing: "Abrindo o instalador. O app vai fechar e abrir de novo sozinho.",
};

/**
 * Fração concluída (0–1) para a barra de progresso. `null` quando não dá para
 * saber (backup, ou servidor sem o tamanho do arquivo).
 */
export function updateFraction(progress: UpdateProgress | null): number | null {
  if (!progress) return null;
  if (progress.stage === "installing") return 1;
  if (progress.stage !== "downloading" || !progress.totalBytes) return null;
  return Math.min(1, progress.downloadedBytes / progress.totalBytes);
}

/** Quanto já foi baixado, com o total quando o servidor informa. */
export function downloadedText(progress: UpdateProgress | null): string | null {
  if (progress?.stage !== "downloading") return null;
  const downloaded = formatBytes(progress.downloadedBytes);
  return progress.totalBytes
    ? `${downloaded} de ${formatBytes(progress.totalBytes)}`
    : `${downloaded} baixados`;
}
