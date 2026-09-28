/**
 * Paleta de cores nomeadas (categorias de tarefas, eventos do calendário).
 * Cada cor é um token do tema (`--zdc-category-*`); o banco guarda só o nome.
 * Espelha `CategoryColor` em `src-tauri/src/domain/task_categories.rs`.
 */
export const CATEGORY_COLORS = [
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
  "slate",
] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];
