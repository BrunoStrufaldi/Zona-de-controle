/** Espelha `AppInfo` em src-tauri/src/commands/app.rs. */
export interface AppInfo {
  name: string;
  version: string;
  identifier: string;
  databasePath: string;
  schemaVersion: number;
  /** Versão anterior quando esta é a primeira abertura depois de atualizar. */
  updatedFrom: string | null;
}

/** Espelha `AvailableUpdate` em src-tauri/src/domain/app_update.rs. */
export interface AvailableUpdate {
  currentVersion: string;
  version: string;
  /** Novidades da versão (texto simples), se houver. */
  notes: string | null;
}

export type UpdateStage = "backup" | "downloading" | "installing";

/** Espelha `UpdateProgress` em src-tauri/src/domain/app_update.rs. */
export interface UpdateProgress {
  stage: UpdateStage;
  downloadedBytes: number;
  /** `null` quando o servidor não informa o tamanho. */
  totalBytes: number | null;
}
