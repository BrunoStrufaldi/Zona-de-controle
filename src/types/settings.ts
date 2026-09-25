import { type IsoDateTime } from "@/types/common";
import { type JsonValue } from "@/types/json";

/** Espelha `SettingEntry` em src-tauri/src/repositories/settings.rs. */
export interface SettingEntry {
  key: string;
  value: JsonValue;
  updatedAt: IsoDateTime;
}
