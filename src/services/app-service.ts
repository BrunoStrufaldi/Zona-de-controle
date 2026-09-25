import { invokeCommand } from "@/services/tauri/commands";
import { type AppInfo } from "@/types/app";

export function getAppInfo(): Promise<AppInfo> {
  return invokeCommand("get_app_info");
}
