/** Remove acentos e caixa para comparar texto de busca. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** O texto contém a busca (sem diferenciar acentos e maiúsculas)? Busca vazia = sim. */
export function matchesSearch(haystack: readonly string[], search: string): boolean {
  const query = normalizeSearchText(search.trim());
  if (query === "") return true;
  return normalizeSearchText(haystack.join(" ")).includes(query);
}
