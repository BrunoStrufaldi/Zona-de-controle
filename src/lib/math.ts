/**
 * Razão `part / total` limitada a [0, 1]. Totais zero, negativos ou inválidos
 * resultam em 0 (evita divisão por zero em indicadores).
 */
export function safeRatio(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(1, Math.max(0, part / total));
}
