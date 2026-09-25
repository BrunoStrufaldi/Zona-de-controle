/**
 * Tags compartilhadas entre módulos (tarefas e notas). Espelha
 * `src-tauri/src/domain/tags.rs` (o backend é a fonte da verdade).
 */
export const TAG_LIMITS = { tags: 10, tagChars: 32 } as const;

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
