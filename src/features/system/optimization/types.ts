/**
 * Contrato da Otimização segura (Fase 4). Espelha
 * `src-tauri/src/domain/optimization.rs`.
 *
 * - Análise (somente leitura): o Rust percorre as pastas da allowlist e devolve
 *   um resumo por origem; os itens ficam guardados lá e são listados por página.
 * - Limpeza (destrutiva): a tela envia só QUAIS origens limpar, depois da
 *   confirmação explícita; os caminhos vêm da análise guardada no Rust, que
 *   confere cada item de novo, pula os que estão em uso ou mudaram, permite
 *   cancelar entre arquivos e registra o resultado no log de auditoria.
 */

export type CleanupCategoryId = "tempFiles" | "safeCaches" | "recycleBin";

/** Local (ou família de locais) da allowlist. */
export type CleanupSource =
  | "userTemp"
  | "directXShaders"
  | "nvidiaShaders"
  | "amdShaders"
  | "errorReports"
  | "crashDumps"
  | "thumbnails"
  | "chrome"
  | "edge"
  | "brave"
  | "firefox"
  | "recycleBin";

/**
 * `ready`: pode ser limpa (mesmo vazia). `notFound`: não existe neste
 * computador. `inUse`: o programa dono do cache (navegador) está aberto.
 */
export type SourceStatus = "ready" | "notFound" | "inUse";

export interface SourceSummary {
  source: CleanupSource;
  category: CleanupCategoryId;
  status: SourceStatus;
  /** Pastas encontradas e lidas. */
  folders: string[];
  itemCount: number;
  totalBytes: number;
  /** Arquivos que ficaram de fora por serem recentes (só temporários). */
  recentCount: number;
  recentBytes: number;
  /** Links, junções, arquivos só na nuvem ou sem acesso. */
  ignoredCount: number;
}

export interface CleanupScan {
  /** Identifica a análise guardada no Rust (usada para listar os itens). */
  id: number;
  tempMinAgeHours: number;
  sources: SourceSummary[];
}

export interface CleanupItem {
  /** Caminho completo. Na Lixeira, o local original do item. */
  path: string;
  bytes: number;
  /** Data de modificação (na Lixeira, da exclusão), em ms desde 1970. */
  dateMs: number | null;
}

export interface CleanupItemPage {
  items: CleanupItem[];
  total: number;
}

/** Resultado da tentativa de remover um item (espelha `RemovalOutcome`). */
export type RemovalOutcome =
  "removed" | "inUse" | "changed" | "missing" | "denied" | "refused" | "failed";

/** Andamento da limpeza em curso. */
export interface CleanupProgress {
  totalItems: number;
  processedItems: number;
  removedBytes: number;
  currentSource: CleanupSource | null;
  cancelRequested: boolean;
}

export interface SourceCleanupResult {
  source: CleanupSource;
  plannedCount: number;
  removedCount: number;
  removedBytes: number;
  inUseCount: number;
  /** Mudaram desde a análise ou já não existiam. */
  changedCount: number;
  /** Sem permissão, recusados ou com outro erro. */
  failedCount: number;
}

export interface NotRemovedItem {
  path: string;
  reason: RemovalOutcome;
}

export interface CleanupReport {
  cancelled: boolean;
  sources: SourceCleanupResult[];
  /** Até 50 itens que ficaram (os que já não existiam não entram). */
  notRemoved: NotRemovedItem[];
}
