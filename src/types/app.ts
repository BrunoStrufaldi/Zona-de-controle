/** Espelha `AppInfo` em src-tauri/src/commands/app.rs. */
export interface AppInfo {
  name: string;
  version: string;
  identifier: string;
  databasePath: string;
  schemaVersion: number;
}
