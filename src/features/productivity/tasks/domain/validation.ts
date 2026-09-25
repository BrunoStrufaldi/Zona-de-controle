import { MAX_RECURRENCE_INTERVAL } from "@/features/productivity/tasks/domain/recurrence";
import { type TaskInput } from "@/features/productivity/tasks/types";

/** Limites espelhados de `src-tauri/src/domain/tasks.rs` (o backend é a fonte da verdade). */
export const TASK_LIMITS = {
  titleChars: 200,
  descriptionChars: 10_000,
  tags: 10,
  tagChars: 32,
  checklistItems: 50,
  checklistItemChars: 200,
} as const;

export type TaskInputErrors = Partial<Record<keyof TaskInput, string>>;

/** Normaliza uma tag como o backend: espaços colapsados e minúsculas. */
export function normalizeTag(tag: string): string {
  return tag.trim().split(/\s+/).join(" ").toLowerCase();
}

/** Adiciona tags normalizadas, ignorando vazias e duplicadas. */
export function mergeTags(current: readonly string[], incoming: readonly string[]): string[] {
  const result = [...current];
  for (const raw of incoming) {
    const tag = normalizeTag(raw);
    if (tag !== "" && !result.includes(tag)) result.push(tag);
  }
  return result;
}

/** Validação para feedback imediato no formulário. Retorna `{}` quando válido. */
export function validateTaskInput(input: TaskInput): TaskInputErrors {
  const errors: TaskInputErrors = {};
  const title = input.title.trim();

  if (title === "") errors.title = "Informe um título.";
  else if (title.length > TASK_LIMITS.titleChars)
    errors.title = `Use no máximo ${TASK_LIMITS.titleChars} caracteres.`;

  if (input.description.length > TASK_LIMITS.descriptionChars)
    errors.description = `Use no máximo ${TASK_LIMITS.descriptionChars} caracteres.`;

  if (input.tags.length > TASK_LIMITS.tags) errors.tags = `Use no máximo ${TASK_LIMITS.tags} tags.`;
  else if (input.tags.some((tag) => tag.length > TASK_LIMITS.tagChars))
    errors.tags = `Cada tag pode ter no máximo ${TASK_LIMITS.tagChars} caracteres.`;

  if (input.recurrence !== null) {
    const { interval } = input.recurrence;
    if (!Number.isInteger(interval) || interval < 1 || interval > MAX_RECURRENCE_INTERVAL)
      errors.recurrence = `Use um intervalo entre 1 e ${MAX_RECURRENCE_INTERVAL}.`;
    else if (input.dueDate === null)
      errors.recurrence = "Tarefas recorrentes precisam de data de vencimento.";
  }

  const items = input.checklist.filter((item) => item.text.trim() !== "");
  if (items.length > TASK_LIMITS.checklistItems)
    errors.checklist = `Use no máximo ${TASK_LIMITS.checklistItems} itens.`;
  else if (items.some((item) => item.text.trim().length > TASK_LIMITS.checklistItemChars))
    errors.checklist = `Cada item pode ter no máximo ${TASK_LIMITS.checklistItemChars} caracteres.`;

  return errors;
}
