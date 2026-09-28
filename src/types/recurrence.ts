/**
 * Frequências de repetição (tarefas e eventos). Espelha `RecurrenceFrequency`
 * em `src-tauri/src/domain/task_recurrence.rs`.
 */
export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];
