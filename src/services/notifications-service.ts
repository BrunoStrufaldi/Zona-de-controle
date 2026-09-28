import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import { isDesktopRuntime } from "@/services/tauri/runtime";

/**
 * Mostra uma notificação do sistema (Windows). Retorna `false` fora do app
 * desktop ou sem permissão, para quem chamou exibir um aviso dentro do app.
 */
export async function showSystemNotification(title: string, body: string): Promise<boolean> {
  if (!isDesktopRuntime()) return false;
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
  if (granted) sendNotification({ title, body });
  return granted;
}
