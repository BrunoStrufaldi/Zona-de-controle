import { invoke } from "@tauri-apps/api/core";

import {
  type Note,
  type NoteFolder,
  type NoteInput,
  type NoteVersion,
} from "@/features/productivity/notes/types";
import { type Routine, type RoutineInput } from "@/features/productivity/routines/types";
import {
  type BatteryProviderDescriptor,
  type DeviceBatteryInfo,
} from "@/features/system/devices/types";
import {
  type Task,
  type TaskCategory,
  type TaskCategoryInput,
  type TaskChange,
  type TaskInput,
  type TaskStatus,
} from "@/features/productivity/tasks/types";
import { type CleanupCategoryDescriptor } from "@/features/system/optimization/types";
import { DESKTOP_ONLY_MESSAGE, ServiceError, toServiceError } from "@/services/tauri/errors";
import { isDesktopRuntime } from "@/services/tauri/runtime";
import { type AppInfo } from "@/types/app";
import { type AuditEntry } from "@/types/audit";
import { type BackupFile, type BackupOverview } from "@/types/backup";
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
  list_database_backups: { args: undefined; result: BackupOverview };
  create_database_backup: { args: undefined; result: BackupFile };
  list_battery_providers: { args: undefined; result: BatteryProviderDescriptor[] };
  list_battery_devices: { args: undefined; result: DeviceBatteryInfo[] };
  list_cleanup_categories: { args: undefined; result: CleanupCategoryDescriptor[] };
  list_tasks: { args: undefined; result: Task[] };
  list_archived_tasks: { args: undefined; result: Task[] };
  list_task_tags: { args: undefined; result: string[] };
  create_task: { args: { input: TaskInput }; result: TaskChange };
  update_task: { args: { id: number; input: TaskInput }; result: TaskChange };
  move_task: {
    args: { id: number; status: TaskStatus; beforeId: number | null };
    result: TaskChange;
  };
  set_checklist_item_done: { args: { itemId: number; done: boolean }; result: Task };
  archive_task: { args: { id: number }; result: Task };
  archive_completed_tasks: { args: undefined; result: number };
  restore_task: { args: { id: number }; result: Task };
  delete_task: { args: { id: number }; result: null };
  list_task_categories: { args: undefined; result: TaskCategory[] };
  create_task_category: { args: { input: TaskCategoryInput }; result: TaskCategory };
  update_task_category: { args: { id: number; input: TaskCategoryInput }; result: TaskCategory };
  delete_task_category: { args: { id: number }; result: null };
  list_notes: { args: undefined; result: Note[] };
  create_note: { args: { input: NoteInput }; result: Note };
  update_note: { args: { id: number; input: NoteInput }; result: Note };
  set_note_favorite: { args: { id: number; favorite: boolean }; result: Note };
  delete_note: { args: { id: number }; result: null };
  list_note_versions: { args: { noteId: number }; result: NoteVersion[] };
  restore_note_version: { args: { versionId: number }; result: Note };
  list_note_folders: { args: undefined; result: NoteFolder[] };
  create_note_folder: { args: { name: string }; result: NoteFolder };
  rename_note_folder: { args: { id: number; name: string }; result: NoteFolder };
  delete_note_folder: { args: { id: number }; result: null };
  list_routines: { args: undefined; result: Routine[] };
  create_routine: { args: { input: RoutineInput }; result: Routine };
  update_routine: { args: { id: number; input: RoutineInput }; result: Routine };
  set_habit_done: { args: { habitId: number; date: string; done: boolean }; result: Routine };
  delete_routine: { args: { id: number }; result: null };
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
