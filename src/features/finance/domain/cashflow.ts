import { type CashflowSummary } from "@/features/finance/types";

/**
 * Resumo de receitas e despesas. O percentual de economia é `saldo / receita`
 * e fica negativo quando as despesas superam a receita; sem receita, é 0.
 */
export function summarizeCashflow(income: number, expenses: number): CashflowSummary {
  const net = income - expenses;
  const savingsRate = income > 0 ? net / income : 0;
  return { income, expenses, net, savingsRate };
}
