import { type CleanupCategoryDescriptor } from "@/features/system/optimization/types";
import { invokeCommand } from "@/services/tauri/commands";

/**
 * Categorias de limpeza previstas (somente leitura). Operações de limpeza NÃO
 * existem nesta fase; quando existirem, ficarão em funções separadas e só
 * serão chamadas após confirmação explícita do usuário.
 */
export function listCleanupCategories(): Promise<CleanupCategoryDescriptor[]> {
  return invokeCommand("list_cleanup_categories");
}
