/**
 * Contrato do Espaço em disco. Espelha `src-tauri/src/domain/disk_usage.rs` e
 * `src-tauri/src/services/disk_usage.rs`.
 *
 * Somente leitura: o Rust percorre a unidade inteira (só nomes, tamanhos e
 * datas; sem seguir links nem pedir administrador) e guarda a árvore em
 * memória. A tela pede o conteúdo de cada pasta ao abri-la.
 */

export type DiskEntryKind = "folder" | "file";

/** Uma linha da árvore. */
export interface DiskEntry {
  /** Só pastas: o id para listar o conteúdo. */
  folderId: number | null;
  name: string;
  kind: DiskEntryKind;
  /** Tamanho do conteúdo. */
  bytes: number;
  /** Espaço ocupado no disco (arquivos só na nuvem ocupam quase nada). */
  allocatedBytes: number;
  /** Só pastas: arquivos dentro dela, em qualquer nível. */
  files: number | null;
  /** Modificação mais recente (pastas: entre os arquivos de dentro). */
  modifiedMs: number | null;
  /** Pasta que não pôde ser lida (sem permissão): o conteúdo não foi somado. */
  unreadable: boolean;
  hasChildren: boolean;
}

/** Itens menores que ficaram de fora de uma listagem, somados. */
export interface HiddenItems {
  count: number;
  bytes: number;
  allocatedBytes: number;
}

export interface FolderChildren {
  path: string;
  /** Maiores primeiro. */
  entries: DiskEntry[];
  rest: HiddenItems | null;
}

export interface DiskTotals {
  bytes: number;
  allocatedBytes: number;
  files: number;
  folders: number;
  unreadableFolders: number;
  modifiedMs: number | null;
}

export interface DiskScanStats {
  /** Links, junções e pontos de montagem, que não são seguidos. */
  skippedLinks: number;
  /** Nomes repetidos de arquivos com links físicos (contados uma vez só). */
  hardLinkDuplicates: number;
  hardLinkBytes: number;
  /** Arquivos só na nuvem (OneDrive); `cloudOnlyBytes` é o tamanho deles. */
  cloudOnlyFiles: number;
  cloudOnlyBytes: number;
}

export interface LargeFile {
  path: string;
  bytes: number;
  allocatedBytes: number;
  modifiedMs: number | null;
}

/** Resumo de uma análise concluída. */
export interface DiskUsageScan {
  id: number;
  /** Ex.: "C:". */
  mountPoint: string;
  fileSystem: string;
  volumeTotalBytes: number;
  volumeUsedBytes: number;
  /** Raiz da árvore (ex.: "C:\"). */
  root: DiskEntry;
  totals: DiskTotals;
  stats: DiskScanStats;
  /** Em uso na unidade, mas fora das pastas lidas. */
  unaccountedBytes: number;
  /** Maiores primeiro. */
  largestFiles: LargeFile[];
  finishedAtMs: number;
  durationMs: number;
}

export interface DiskUsageProgress {
  mountPoint: string;
  files: number;
  folders: number;
  allocatedBytes: number;
  currentFolder: string | null;
  cancelRequested: boolean;
}
