import { invokeCommand } from "@/services/tauri/commands";
import { type AppInfo, type AvailableUpdate, type UpdateProgress } from "@/types/app";

export function getAppInfo(): Promise<AppInfo> {
  return invokeCommand("get_app_info");
}

/** Procura uma versão maior que a instalada (`null` = já está na mais recente). */
export function checkAppUpdate(): Promise<AvailableUpdate | null> {
  return invokeCommand("check_app_update");
}

/**
 * Instala a versão encontrada na última busca (backup, download, assinatura e
 * instalador). No Windows o app fecha no fim e o instalador o abre de novo.
 */
export async function installAppUpdate(version: string): Promise<void> {
  await invokeCommand("install_app_update", { version });
}

export function getAppUpdateProgress(): Promise<UpdateProgress | null> {
  return invokeCommand("get_app_update_progress");
}
