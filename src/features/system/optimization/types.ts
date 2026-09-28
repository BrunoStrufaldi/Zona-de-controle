/**
 * Contrato da Otimização segura (Fase 4). Espelha
 * `src-tauri/src/domain/optimization.rs`.
 *
 * 4.1: só ANÁLISE (somente leitura). O Rust percorre as pastas da allowlist e
 * devolve um resumo por origem; os itens ficam guardados lá e são listados por
 * página. Nenhuma operação remove arquivos nesta etapa. Quando a limpeza
 * existir (4.2), ela deverá:
 *  - exigir confirmação explícita, mostrando exatamente o que será removido;
 *  - agir só sobre itens da análise, dentro da allowlist;
 *  - registrar cada execução no log de auditoria;
 *  - permitir cancelamento;
 *  - nunca executar comandos shell nem pedir privilégios de administrador.
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
