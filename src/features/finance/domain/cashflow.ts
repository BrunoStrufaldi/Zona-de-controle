import {
  type CashflowSummary,
  type Cents,
  type Transaction,
  type TransactionKind,
} from "@/features/finance/types";

/**
 * Resumo de receitas e despesas. O percentual de economia é `saldo / receita`
 * e fica negativo quando as despesas superam a receita; sem receita, é 0.
 */
export function summarizeCashflow(income: Cents, expenses: Cents): CashflowSummary {
  const net = income - expenses;
  const savingsRate = income > 0 ? net / income : 0;
  return { income, expenses, net, savingsRate };
}

/**
 * Efeito no saldo de uma conta: entradas somam, saídas subtraem e a
 * transferência sai da conta de origem e entra na de destino.
 */
export function balanceEffect(
  transaction: Pick<Transaction, "kind" | "amount" | "accountId" | "transferAccountId">,
  accountId: number,
): Cents {
  if (transaction.kind === "transfer") {
    if (transaction.transferAccountId === accountId) return transaction.amount;
    return transaction.accountId === accountId ? -transaction.amount : 0;
  }
  if (transaction.accountId !== accountId) return 0;
  return transaction.kind === "income" ? transaction.amount : -transaction.amount;
}

/** Soma das entradas e saídas de uma lista (ex.: o resultado dos filtros); transferências ficam de fora. */
export function summarizeTransactions(transactions: readonly Transaction[]): CashflowSummary {
  const total = (kind: TransactionKind) =>
    transactions
      .filter((transaction) => transaction.kind === kind)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
  return summarizeCashflow(total("income"), total("expense"));
}

/** Pendente com data anterior a hoje: conta ou recebimento atrasado. */
export function isOverdue(
  transaction: Pick<Transaction, "status" | "date">,
  today: string,
): boolean {
  return transaction.status === "pending" && transaction.date < today;
}
