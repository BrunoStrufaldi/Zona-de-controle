/** Espelha `src-tauri/src/domain/backup.rs`. */
export interface BackupFile {
  fileName: string;
  path: string;
  sizeBytes: number;
  /** Data/hora local do backup (`aaaa-mm-ddThh:mm:ss`, sem fuso). */
  createdAt: string;
}

export interface BackupOverview {
  directory: string;
  /** Mais recentes primeiro. */
  backups: BackupFile[];
}
