import { type IsoDate } from "@/types/common";

/**
 * Contratos do módulo Financeiro (Fases 5–7).
 *
 * Valores monetários são armazenados em CENTAVOS (inteiros) para evitar erros
 * de ponto flutuante; a formatação para R$ acontece apenas na exibição.
 */

/** Valor monetário em centavos de real. */
export type Cents = number;

/** Mês de referência no formato `aaaa-mm`. */
export type YearMonth = string;

export type TransactionType = "income" | "expense";
export type TransactionStatus = "paid" | "pending";

export interface Transaction {
  id: string;
  date: IsoDate;
  description: string;
  categoryId: string;
  tags: readonly string[];
  amount: Cents;
  type: TransactionType;
  status: TransactionStatus;
}

export interface TransactionFilters {
  month?: number;
  year?: number;
  categoryId?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  minAmount?: Cents;
  maxAmount?: Cents;
}

export type RecurrenceFrequency = "weekly" | "monthly" | "yearly";

export interface RecurringExpense {
  id: string;
  description: string;
  categoryId: string;
  amount: Cents;
  frequency: RecurrenceFrequency;
  /** Dia do vencimento (1–31). */
  dueDay: number;
  status: TransactionStatus;
  renewsAt?: IsoDate;
}

export interface Installment {
  id: string;
  description: string;
  totalAmount: Cents;
  installmentCount: number;
  installmentAmount: Cents;
  currentInstallment: number;
  startMonth: YearMonth;
}

export type InvestmentCategory = "fixedIncome" | "stocks" | "reits" | "etfs" | "crypto" | "other";

export interface Investment {
  id: string;
  asset: string;
  category: InvestmentCategory;
  quantity: number;
  averagePrice: Cents;
  investedAmount: Cents;
  currentAmount: Cents;
  institution: string;
  date: IsoDate;
}

/** Totais de um período (em reais, já convertidos para exibição). */
export interface CashflowSummary {
  income: number;
  expenses: number;
  net: number;
  /** Fração economizada da receita (0–1); negativa quando há déficit. */
  savingsRate: number;
}

export interface MonthlyCashflow {
  /** Primeiro dia do mês (`aaaa-mm-01`). */
  month: IsoDate;
  income: number;
  expenses: number;
}
