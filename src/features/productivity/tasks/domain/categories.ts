import {
  CATEGORY_COLORS,
  type CategoryColor,
  type TaskCategory,
  type TaskCategoryInput,
} from "@/features/productivity/tasks/types";

/** Limites espelhados de `src-tauri/src/domain/task_categories.rs`. */
export const CATEGORY_LIMITS = { nameChars: 40, categories: 50 } as const;

export const categoryColorLabels: Record<CategoryColor, string> = {
  red: "Vermelho",
  orange: "Laranja",
  amber: "Âmbar",
  green: "Verde",
  teal: "Turquesa",
  blue: "Azul",
  violet: "Violeta",
  pink: "Rosa",
  slate: "Cinza",
};

export type CategoriesById = ReadonlyMap<number, TaskCategory>;

export function indexCategories(categories: readonly TaskCategory[]): CategoriesById {
  return new Map(categories.map((category) => [category.id, category]));
}

/** Primeira cor ainda não usada (ou a próxima da paleta, em ciclo). */
export function suggestCategoryColor(categories: readonly TaskCategory[]): CategoryColor {
  const used = new Set(categories.map((category) => category.color));
  return (
    CATEGORY_COLORS.find((color) => !used.has(color)) ??
    CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length] ??
    "blue"
  );
}

/** Nome normalizado como no backend: espaços colapsados nas pontas e no meio. */
export function normalizeCategoryName(name: string): string {
  return name.trim().split(/\s+/).join(" ");
}

/** Validação para feedback imediato. Retorna a mensagem de erro ou `null`. */
export function validateCategoryInput(
  input: TaskCategoryInput,
  existing: readonly TaskCategory[],
  editingId: number | null = null,
): string | null {
  const name = normalizeCategoryName(input.name);
  if (name === "") return "Informe um nome.";
  if (name.length > CATEGORY_LIMITS.nameChars)
    return `Use no máximo ${CATEGORY_LIMITS.nameChars} caracteres.`;
  const clash = existing.some(
    (category) => category.id !== editingId && category.name.toLowerCase() === name.toLowerCase(),
  );
  return clash ? `Já existe uma categoria chamada “${name}”.` : null;
}
