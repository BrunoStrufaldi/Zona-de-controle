import { invokeCommand } from "@/services/tauri/commands";
import { type BackupFile, type BackupOverview } from "@/types/backup";

/** Pasta de backups e arquivos existentes, mais recentes primeiro. */
export function listDatabaseBackups(): Promise<BackupOverview> {
  return invokeCommand("list_database_backups");
}

/** Cria uma cópia verificada do banco (nunca sobrescreve). Auditado. */
export function createDatabaseBackup(): Promise<BackupFile> {
  return invokeCommand("create_database_backup");
}
