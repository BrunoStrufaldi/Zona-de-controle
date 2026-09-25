/**
 * Contrato do módulo de Otimização Segura (Fase 4). Espelha
 * `src-tauri/src/domain/optimization`.
 *
 * Nesta fase existem APENAS descritores somente leitura. Nenhuma operação de
 * limpeza ou exclusão está implementada. Quando forem implementadas, as
 * operações destrutivas deverão:
 *  - exigir confirmação explícita, mostrando exatamente o que será removido;
 *  - evitar arquivos críticos do sistema e seguir uma allowlist de locais;
 *  - registrar cada execução no log de auditoria;
 *  - permitir cancelamento quando possível;
 *  - nunca executar comandos shell arbitrários;
 *  - rodar com o menor privilégio necessário (sem elevação de administrador).
 */

export type CleanupCategoryId = "tempFiles" | "safeCaches" | "recycleBin";

/** Risco de remover os itens da categoria. */
export type CleanupRisk = "low" | "medium";

export type CleanupCategoryStatus = "planned" | "available";

export interface CleanupCategoryDescriptor {
  id: CleanupCategoryId;
  name: string;
  description: string;
  risk: CleanupRisk;
  /** Toda categoria destrutiva exige confirmação explícita. */
  requiresConfirmation: boolean;
  status: CleanupCategoryStatus;
}

/**
 * Resultado de uma análise (somente leitura) — será produzido na Fase 4.
 * A análise nunca remove nada; ela apenas lista candidatos.
 */
export interface CleanupScanResult {
  categoryId: CleanupCategoryId;
  itemCount: number;
  totalBytes: number;
  sampleItems: readonly string[];
}
