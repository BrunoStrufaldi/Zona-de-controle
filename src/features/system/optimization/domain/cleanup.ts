import {
  type CleanupCategoryId,
  type CleanupProgress,
  type CleanupReport,
  type CleanupScan,
  type CleanupSource,
  type RemovalOutcome,
  type SourceCleanupResult,
  type SourceSummary,
} from "@/features/system/optimization/types";
import { formatBytes, formatNumber } from "@/lib/format";

/** Ordem fixa das categorias na tela. */
export const CLEANUP_CATEGORIES: readonly CleanupCategoryId[] = [
  "tempFiles",
  "safeCaches",
  "recycleBin",
];

export const categoryLabels: Record<CleanupCategoryId, string> = {
  tempFiles: "Arquivos temporários",
  safeCaches: "Caches seguros",
  recycleBin: "Lixeira",
};

interface SourceInfo {
  name: string;
  description: string;
}

const SHADER_NOTE = "É recriado sozinho; jogos podem engasgar um pouco na primeira vez.";
const BROWSER_NOTE =
  "Cache de páginas, de código e da GPU de cada perfil. Cookies, senhas, histórico e extensões não entram.";

export const sourceInfo: Record<CleanupSource, SourceInfo> = {
  userTemp: {
    name: "Pasta temporária do usuário",
    description: "Arquivos deixados por instaladores e programas na pasta Temp.",
  },
  directXShaders: {
    name: "Shaders do DirectX",
    description: `Cache de shaders do Windows (D3DSCache). ${SHADER_NOTE}`,
  },
  nvidiaShaders: {
    name: "Shaders da NVIDIA",
    description: `Cache de shaders do driver (DXCache e GLCache). ${SHADER_NOTE}`,
  },
  amdShaders: {
    name: "Shaders da AMD",
    description: `Cache de shaders do driver (DxCache, GLCache e VkCache). ${SHADER_NOTE}`,
  },
  errorReports: {
    name: "Relatórios de erro do Windows",
    description:
      "Relatórios de falhas já enviados ou na fila. Só servem para investigar erros antigos.",
  },
  crashDumps: {
    name: "Despejos de travamento",
    description: "Arquivos .dmp gravados quando um programa trava (pasta CrashDumps).",
  },
  thumbnails: {
    name: "Miniaturas do Explorer",
    description:
      "Cache das miniaturas de imagens e vídeos. O Explorer costuma mantê-lo em uso: o que estiver em uso é pulado.",
  },
  chrome: { name: "Google Chrome", description: BROWSER_NOTE },
  edge: { name: "Microsoft Edge", description: BROWSER_NOTE },
  brave: { name: "Brave", description: BROWSER_NOTE },
  firefox: { name: "Mozilla Firefox", description: BROWSER_NOTE },
  recycleBin: {
    name: "Lixeira do Windows",
    description: "Itens que você já excluiu, em todas as unidades fixas.",
  },
};

export interface CategoryResult {
  category: CleanupCategoryId;
  /** Origens encontradas neste computador. */
  sources: SourceSummary[];
  /** Origens que não existem aqui (ex.: navegador não instalado). */
  missing: SourceSummary[];
  totalBytes: number;
  itemCount: number;
}

/** Uma entrada por categoria, na ordem fixa, mesmo sem origens encontradas. */
export function groupByCategory(scan: CleanupScan): CategoryResult[] {
  return CLEANUP_CATEGORIES.map((category) => {
    const all = scan.sources.filter((source) => source.category === category);
    const sources = all.filter((source) => source.status !== "notFound");
    return {
      category,
      sources,
      missing: all.filter((source) => source.status === "notFound"),
      totalBytes: sum(sources, (source) => source.totalBytes),
      itemCount: sum(sources, (source) => source.itemCount),
    };
  });
}

function sum(sources: SourceSummary[], value: (source: SourceSummary) => number): number {
  return sources.reduce((total, source) => total + value(source), 0);
}

export interface ScanTotals {
  /** O que pode ser liberado agora. */
  readyBytes: number;
  /** Caches de programas abertos (precisam ser fechados antes). */
  inUseBytes: number;
}

export function scanTotals(scan: CleanupScan): ScanTotals {
  const ofStatus = (status: SourceSummary["status"]) =>
    sum(
      scan.sources.filter((source) => source.status === status),
      (source) => source.totalBytes,
    );
  return { readyBytes: ofStatus("ready"), inUseBytes: ofStatus("inUse") };
}

/** "21.214 arquivos" (na Lixeira, "3 itens": pastas contam como um item). */
export function itemCountLabel(source: CleanupSource, count: number): string {
  const [one, many] = source === "recycleBin" ? ["item", "itens"] : ["arquivo", "arquivos"];
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

export interface SourceNote {
  text: string;
  /** Pede uma ação do usuário (ex.: fechar o navegador). */
  warning: boolean;
}

/**
 * Observações da origem: recentes que ficaram de fora, entradas ignoradas e
 * o aviso de programa aberto.
 */
export function sourceNotes(summary: SourceSummary, tempMinAgeHours: number): SourceNote[] {
  const notes: SourceNote[] = [];
  if (summary.recentCount > 0) {
    const count = formatNumber(summary.recentCount);
    const files = summary.recentCount === 1 ? "arquivo recente" : "arquivos recentes";
    notes.push({
      text: `${count} ${files} (${formatBytes(summary.recentBytes)}), com menos de ${tempMinAgeHours} horas, ficam de fora.`,
      warning: false,
    });
  }
  if (summary.ignoredCount > 0) {
    const count = formatNumber(summary.ignoredCount);
    notes.push({
      text:
        summary.ignoredCount === 1
          ? "1 item ignorado (link, arquivo só na nuvem ou sem acesso)."
          : `${count} itens ignorados (links, arquivos só na nuvem ou sem acesso).`,
      warning: false,
    });
  }
  if (summary.status === "inUse") {
    notes.push({
      text: `Feche o ${sourceInfo[summary.source].name} para limpar este cache.`,
      warning: true,
    });
  }
  return notes;
}

/** Critério de cada categoria, exibido no rodapé do card. */
export function categoryCriteria(category: CleanupCategoryId, tempMinAgeHours: number): string {
  switch (category) {
    case "tempFiles":
      return `Só arquivos criados e modificados há mais de ${tempMinAgeHours} horas. Arquivos em uso são pulados.`;
    case "safeCaches":
      return "Só pastas de cache conhecidas, recriadas pelos próprios programas. Links e atalhos nunca são seguidos.";
    case "recycleBin":
      return "Itens da sua Lixeira; lixeiras de outros usuários não entram.";
  }
}

/** Shaders não vêm marcados: apagar faz os jogos recompilarem (engasgos na primeira vez). */
const SHADER_SOURCES: readonly CleanupSource[] = ["directXShaders", "nvidiaShaders", "amdShaders"];

/** Só origens prontas e com itens podem entrar na limpeza. */
export function isSelectable(summary: SourceSummary): boolean {
  return summary.status === "ready" && summary.itemCount > 0;
}

/** Marcadas ao abrir a análise: tudo que pode ser limpo, menos os shaders. */
export function defaultSelection(scan: CleanupScan): CleanupSource[] {
  return scan.sources
    .filter((summary) => isSelectable(summary) && !SHADER_SOURCES.includes(summary.source))
    .map((summary) => summary.source);
}

export interface SelectionTotals {
  /** Origens escolhidas (só as selecionáveis), na ordem da análise. */
  sources: SourceSummary[];
  itemCount: number;
  totalBytes: number;
}

export function selectionTotals(
  scan: CleanupScan,
  selected: ReadonlySet<CleanupSource>,
): SelectionTotals {
  const sources = scan.sources.filter(
    (summary) => selected.has(summary.source) && isSelectable(summary),
  );
  return {
    sources,
    itemCount: sum(sources, (summary) => summary.itemCount),
    totalBytes: sum(sources, (summary) => summary.totalBytes),
  };
}

/** Avisos da confirmação, conforme o que foi escolhido. */
export function confirmationNotes(sources: SourceSummary[]): string[] {
  const onlyRecycleBin = sources.every((summary) => summary.source === "recycleBin");
  const notes = [
    onlyRecycleBin
      ? "A remoção é permanente e não pode ser desfeita."
      : "A remoção é permanente: os arquivos não vão para a Lixeira.",
    "Arquivos em uso ou que mudaram desde a análise são pulados.",
  ];
  if (sources.some((summary) => SHADER_SOURCES.includes(summary.source))) {
    notes.push("Sem o cache de shaders, os jogos recompilam e podem engasgar na primeira vez.");
  }
  if (sources.some((summary) => summary.source === "recycleBin")) {
    notes.push(
      "A Lixeira é esvaziada de uma vez, no fim, e só se estiver igual à análise. Essa parte não pode ser interrompida.",
    );
  }
  notes.push(
    onlyRecycleBin
      ? "Tudo fica registrado no log de auditoria."
      : "Dá para cancelar entre um arquivo e outro. Tudo fica registrado no log de auditoria.",
  );
  return notes;
}

/** Quantos itens não removidos o relatório traz (igual ao Rust). */
export const NOT_REMOVED_SAMPLE = 50;

export const removalReasonLabels: Record<RemovalOutcome, string> = {
  removed: "Removido",
  inUse: "Em uso",
  changed: "Mudou desde a análise",
  missing: "Já não existia",
  denied: "Sem permissão",
  refused: "Fora dos locais permitidos",
  failed: "Erro ao remover",
};

export interface ReportTotals {
  removedCount: number;
  removedBytes: number;
  inUseCount: number;
  changedCount: number;
  failedCount: number;
  /** Não chegaram a ser processados (limpeza cancelada). */
  pendingCount: number;
}

export function reportTotals(report: CleanupReport): ReportTotals {
  const total = (value: (result: SourceCleanupResult) => number) =>
    report.sources.reduce((acc, result) => acc + value(result), 0);
  const processed = (result: SourceCleanupResult) =>
    result.removedCount + result.inUseCount + result.changedCount + result.failedCount;
  return {
    removedCount: total((result) => result.removedCount),
    removedBytes: total((result) => result.removedBytes),
    inUseCount: total((result) => result.inUseCount),
    changedCount: total((result) => result.changedCount),
    failedCount: total((result) => result.failedCount),
    pendingCount: total((result) => result.plannedCount - processed(result)),
  };
}

/** "248 de 250 arquivos removidos"; "1 de 1 item removido". */
export function removedOfLabel(result: SourceCleanupResult): string {
  const planned = itemCountLabel(result.source, result.plannedCount);
  const verb = result.plannedCount === 1 ? "removido" : "removidos";
  return `${formatNumber(result.removedCount)} de ${planned} ${verb}`;
}

/** "3 pulados (em uso)" etc.: o que não foi removido numa origem. */
export function resultNotes(result: SourceCleanupResult): string[] {
  const notes: string[] = [];
  const count = (value: number, one: string, many: string) =>
    `${formatNumber(value)} ${value === 1 ? one : many}`;
  if (result.inUseCount > 0) notes.push(count(result.inUseCount, "em uso", "em uso"));
  if (result.changedCount > 0) {
    notes.push(count(result.changedCount, "mudou ou sumiu", "mudaram ou sumiram"));
  }
  if (result.failedCount > 0) notes.push(count(result.failedCount, "com erro", "com erro"));
  const pending =
    result.plannedCount -
    result.removedCount -
    result.inUseCount -
    result.changedCount -
    result.failedCount;
  if (pending > 0) notes.push(count(pending, "não processado", "não processados"));
  return notes;
}

/** Percentual (0–100) de itens processados. */
export function progressPercent(progress: CleanupProgress): number {
  if (progress.totalItems <= 0) return 0;
  return (progress.processedItems / progress.totalItems) * 100;
}
