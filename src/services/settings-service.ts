import { invokeCommand } from "@/services/tauri/commands";
import { type JsonValue } from "@/types/json";
import { type SettingEntry } from "@/types/settings";

/** Chaves conhecidas. Formato validado no Rust: letra minúscula + `[a-z0-9._-]`, até 64. */
export const SETTING_KEYS = {
  displayName: "profile.display_name",
} as const;

export const DISPLAY_NAME_MAX_LENGTH = 40;

export function listSettings(): Promise<SettingEntry[]> {
  return invokeCommand("list_settings");
}

export async function getSettingValue(key: string): Promise<JsonValue | null> {
  const entry = await invokeCommand("get_setting", { key });
  return entry?.value ?? null;
}

/** Grava uma configuração. O backend valida e registra a alteração na auditoria. */
export function setSetting(key: string, value: JsonValue): Promise<SettingEntry> {
  return invokeCommand("set_setting", { key, value });
}

/** Nome de exibição do usuário, ou `null` se não definido. */
export async function getDisplayName(): Promise<string | null> {
  const value = await getSettingValue(SETTING_KEYS.displayName);
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export async function setDisplayName(name: string): Promise<string> {
  const normalized = name.trim().slice(0, DISPLAY_NAME_MAX_LENGTH);
  await setSetting(SETTING_KEYS.displayName, normalized);
  return normalized;
}
