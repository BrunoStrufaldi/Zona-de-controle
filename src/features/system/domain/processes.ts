import { type ProcessGroup } from "@/features/system/types";
import { matchesSearch } from "@/lib/text";

export type ProcessSortKey = "cpu" | "memory" | "name";

export const processSortLabels: Record<ProcessSortKey, string> = {
  cpu: "CPU",
  memory: "Memória",
  name: "Nome",
};

/** Ordem natural de cada coluna: números do maior para o menor, nomes de A a Z. */
function compare(a: ProcessGroup, b: ProcessGroup, key: ProcessSortKey): number {
  switch (key) {
    case "cpu":
      return b.cpuPercent - a.cpuPercent;
    case "memory":
      return b.memoryBytes - a.memoryBytes;
    case "name":
      return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
  }
}

/**
 * Filtra pelo nome (sem acentos/maiúsculas) e ordena pela coluna escolhida.
 * Empates caem para memória e depois nome, para a ordem não "pular" a cada leitura.
 */
export function selectProcesses(
  groups: readonly ProcessGroup[],
  search: string,
  sortKey: ProcessSortKey,
): ProcessGroup[] {
  return groups
    .filter((group) => matchesSearch([group.name], search))
    .sort((a, b) => compare(a, b, sortKey) || compare(a, b, "memory") || compare(a, b, "name"));
}
