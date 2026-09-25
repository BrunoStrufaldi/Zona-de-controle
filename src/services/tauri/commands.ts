import { invoke } from "@tauri-apps/api/core";

import {
  type BatteryProviderDescriptor,
  type DeviceBatteryInfo,
} from "@/features/system/devices/types";
import { type CleanupCategoryDescriptor } from "@/features/system/optimization/types";
import { DESKTOP_ONLY_MESSAGE, ServiceError, toServiceError } from "@/services/tauri/errors";
import { isDesktopRuntime } from "@/services/tauri/runtime";
import { type AppInfo } from "@/types/app";
import { type AuditEntry } from "@/types/audit";
import { type JsonValue } from "@/types/json";
import { type SettingEntry } from "@/types/settings";

/**
 * Contrato tipado de todos os commands Rust (src-tauri/src/commands).
 * Ao criar um command, registre-o aqui, em `generate_handler!` (lib.rs),
 * em build.rs e em capabilities/default.toml.
 */
export interface CommandMap {
  get_app_info: { args: undefined; result: AppInfo };
  list_settings: { args: undefined; result: SettingEntry[] };
  get_setting: { args: { key: string }; result: SettingEntry | null };
  set_setting: { args: { key: string; value: JsonValue }; result: SettingEntry };
  list_audit_entries: { args: { limit?: number }; result: AuditEntry[] };
  list_battery_providers: { args: undefined; result: BatteryProviderDescriptor[] };
  list_battery_devices: { args: undefined; result: DeviceBatteryInfo[] };
  list_cleanup_categories: { args: undefined; result: CleanupCategoryDescriptor[] };
}

export type CommandName = keyof CommandMap;

type CommandArgs<K extends CommandName> = CommandMap[K]["args"] extends undefined
  ? []
  : [args: CommandMap[K]["args"]];

/** Chama um command Rust com argumentos e retorno tipados. */
export async function invokeCommand<K extends CommandName>(
  command: K,
  ...args: CommandArgs<K>
): Promise<CommandMap[K]["result"]> {
  if (!isDesktopRuntime()) {
    throw new ServiceError("desktop-only", DESKTOP_ONLY_MESSAGE);
  }
  try {
    return await invoke<CommandMap[K]["result"]>(command, args[0]);
  } catch (error) {
    throw toServiceError(error);
  }
}
