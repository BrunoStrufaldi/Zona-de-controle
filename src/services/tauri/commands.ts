import { invoke } from "@tauri-apps/api/core";

import {
  type CalendarAgenda,
  type CalendarEvent,
  type DueReminder,
  type EventInput,
  type OccurrenceInput,
} from "@/features/productivity/calendar/types";
import {
  type AccountInput,
  type AssetDetail,
  type AssetInput,
  type CategoryInput,
  type CategoryUpdate,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceOverview,
  type ImportCommitInput,
  type ImportPreview,
  type ImportResult,
  type InstallmentsOverview,
  type InvestmentAsset,
  type InvestmentMovement,
  type InvestmentsOverview,
  type InvestmentsPerformance,
  type MovementInput,
  type RecurringInput,
  type RecurringOverview,
  type RecurringSeries,
  type Transaction,
  type TransactionInput,
  type TransactionStatus,
  type ValuationInput,
} from "@/features/finance/types";
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
  type DeviceMarking,
  type UsbInputDevice,
} from "@/features/system/devices/types";
import {
  type Task,
  type TaskCategory,
  type TaskCategoryInput,
  type TaskChange,
  type TaskInput,
  type TaskStatus,
} from "@/features/productivity/tasks/types";
import {
  type DiagnosticReport,
  type DiagnosticSettings,
  type DiagnosticThresholds,
} from "@/features/system/diagnostics/types";
import {
  type CleanupHistory,
  type CleanupItemPage,
  type CleanupProgress,
  type CleanupReport,
  type CleanupScan,
  type CleanupSource,
} from "@/features/system/optimization/types";
import { type ProcessList, type SystemInfo, type SystemSnapshot } from "@/features/system/types";
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
  get_system_info: { args: undefined; result: SystemInfo };
  get_system_snapshot: { args: undefined; result: SystemSnapshot };
  list_processes: { args: undefined; result: ProcessList };
  run_diagnostics: { args: undefined; result: DiagnosticReport };
  get_diagnostic_thresholds: { args: undefined; result: DiagnosticSettings };
  set_diagnostic_thresholds: {
    args: { thresholds: DiagnosticThresholds };
    result: DiagnosticSettings;
  };
  list_battery_providers: { args: undefined; result: BatteryProviderDescriptor[] };
  list_battery_devices: { args: undefined; result: DeviceBatteryInfo[] };
  list_usb_input_devices: { args: undefined; result: UsbInputDevice[] };
  set_device_marking: {
    args: { key: string; marking: DeviceMarking };
    result: UsbInputDevice[];
  };
  scan_cleanup: { args: undefined; result: CleanupScan };
  list_cleanup_items: {
    args: { scanId: number; source: CleanupSource; offset: number; limit: number };
    result: CleanupItemPage;
  };
  run_cleanup: { args: { scanId: number; sources: CleanupSource[] }; result: CleanupReport };
  get_cleanup_progress: { args: undefined; result: CleanupProgress | null };
  cancel_cleanup: { args: undefined; result: boolean };
  list_cleanup_history: { args: { limit: number }; result: CleanupHistory };
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
  list_calendar: { args: { from: string; to: string }; result: CalendarAgenda };
  create_calendar_event: { args: { input: EventInput }; result: CalendarEvent };
  update_calendar_event: { args: { id: number; input: EventInput }; result: CalendarEvent };
  update_event_occurrence: {
    args: { eventId: number; occurrenceDate: string; input: OccurrenceInput };
    result: null;
  };
  delete_calendar_event: { args: { id: number }; result: null };
  delete_event_occurrence: { args: { eventId: number; occurrenceDate: string }; result: null };
  claim_due_reminders: { args: undefined; result: DueReminder[] };
  list_finance_accounts: { args: undefined; result: FinanceAccount[] };
  create_finance_account: { args: { input: AccountInput }; result: FinanceAccount };
  update_finance_account: { args: { id: number; input: AccountInput }; result: FinanceAccount };
  delete_finance_account: { args: { id: number }; result: null };
  list_finance_categories: { args: undefined; result: FinanceCategory[] };
  create_finance_category: { args: { input: CategoryInput }; result: FinanceCategory };
  update_finance_category: {
    args: { id: number; input: CategoryUpdate };
    result: FinanceCategory;
  };
  delete_finance_category: { args: { id: number }; result: null };
  list_transactions: { args: { from: string; to: string }; result: Transaction[] };
  list_transaction_tags: { args: undefined; result: string[] };
  create_transaction: { args: { input: TransactionInput }; result: Transaction };
  update_transaction: { args: { id: number; input: TransactionInput }; result: Transaction };
  set_transaction_status: { args: { id: number; status: TransactionStatus }; result: Transaction };
  delete_transaction: { args: { id: number }; result: null };
  get_finance_overview: { args: { month: string }; result: FinanceOverview };
  preview_finance_import: { args: { fileName: string; content: string }; result: ImportPreview };
  commit_finance_import: { args: { input: ImportCommitInput }; result: ImportResult };
  list_recurring: { args: { from: string; to: string }; result: RecurringOverview };
  create_recurring: { args: { input: RecurringInput }; result: RecurringSeries };
  update_recurring: { args: { id: number; input: RecurringInput }; result: RecurringSeries };
  delete_recurring: { args: { id: number }; result: null };
  register_recurring_occurrence: {
    args: { id: number; occurrenceDate: string; input: TransactionInput };
    result: Transaction;
  };
  link_recurring_occurrence: {
    args: { id: number; occurrenceDate: string; transactionId: number };
    result: null;
  };
  skip_recurring_occurrence: { args: { id: number; occurrenceDate: string }; result: null };
  reopen_recurring_occurrence: { args: { id: number; occurrenceDate: string }; result: null };
  get_installments_overview: { args: undefined; result: InstallmentsOverview };
  get_investments_overview: { args: undefined; result: InvestmentsOverview };
  get_investment_asset: { args: { id: number }; result: AssetDetail };
  get_investments_performance: {
    args: { from: string; to: string };
    result: InvestmentsPerformance;
  };
  create_investment_asset: { args: { input: AssetInput }; result: InvestmentAsset };
  update_investment_asset: { args: { id: number; input: AssetInput }; result: InvestmentAsset };
  delete_investment_asset: { args: { id: number }; result: null };
  create_investment_movement: {
    args: { assetId: number; input: MovementInput };
    result: InvestmentMovement;
  };
  update_investment_movement: {
    args: { id: number; input: MovementInput };
    result: InvestmentMovement;
  };
  delete_investment_movement: { args: { id: number }; result: null };
  link_investment_transaction: {
    args: { assetId: number; transactionId: number; quantity: number | null };
    result: InvestmentMovement;
  };
  set_investment_valuations: { args: { valuations: ValuationInput[] }; result: null };
  delete_investment_valuation: { args: { assetId: number; date: string }; result: null };
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
