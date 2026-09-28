import { type IsoDate, type IsoDateTime } from "@/types/common";
import { type CategoryColor } from "@/types/palette";

/**
 * Contrato de Finanças. Espelha `src-tauri/src/domain/finance/` — mantenha-os
 * em sincronia.
 *
 * Valores monetários são CENTAVOS (inteiros) para evitar erros de ponto
 * flutuante; a conversão para reais acontece apenas na exibição.
 */

/** Valor monetário em centavos de real. */
export type Cents = number;

/** Mês de referência no formato `aaaa-mm`. */
export type YearMonth = string;

export const TRANSACTION_KINDS = ["expense", "income", "transfer"] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

/** Categorias existem só para entradas e saídas. */
export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const TRANSACTION_STATUSES = ["paid", "pending"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const ACCOUNT_KINDS = [
  "checking",
  "savings",
  "credit_card",
  "cash",
  "investment",
  "other",
] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export { CATEGORY_COLORS, type CategoryColor } from "@/types/palette";

export interface FinanceAccount {
  id: number;
  name: string;
  kind: AccountKind;
  color: CategoryColor;
  /** Saldo ao começar a usar o app (pode ser negativo). */
  openingBalance: Cents;
  /** Saldo inicial + entradas pagas − saídas pagas ± transferências pagas. */
  balance: Cents;
  transactionCount: number;
}

export interface AccountInput {
  name: string;
  kind: AccountKind;
  color: CategoryColor;
  openingBalance: Cents;
}

export interface FinanceCategory {
  id: number;
  kind: CategoryKind;
  name: string;
  color: CategoryColor;
  transactionCount: number;
}

/** Criação de categoria (o tipo não muda depois). */
export interface CategoryInput {
  kind: CategoryKind;
  name: string;
  color: CategoryColor;
}

/** Edição de categoria: só nome e cor. */
export type CategoryUpdate = Omit<CategoryInput, "kind">;

/** Parcela `number` de `count` de uma compra parcelada (ex.: 3/6). */
export interface Installment {
  number: number;
  count: number;
}

export interface Transaction {
  id: number;
  /** Na transferência, a conta de onde o dinheiro sai. */
  accountId: number;
  /** Só na transferência: a conta para onde o dinheiro vai. */
  transferAccountId: number | null;
  categoryId: number | null;
  kind: TransactionKind;
  description: string;
  /** Sempre positivo; o tipo define se entra, sai ou move entre contas. */
  amount: Cents;
  /** Na fatura do cartão, o vencimento. */
  date: IsoDate;
  status: TransactionStatus;
  notes: string;
  tags: string[];
  /** Importados da fatura: data da compra. */
  purchaseDate: IsoDate | null;
  installment: Installment | null;
  /** Veio de um extrato importado. */
  imported: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Dados de criação/edição (substituição completa). */
export interface TransactionInput {
  accountId: number;
  /** Obrigatório na transferência (e diferente de `accountId`). */
  transferAccountId: number | null;
  categoryId: number | null;
  kind: TransactionKind;
  description: string;
  amount: Cents;
  date: IsoDate;
  status: TransactionStatus;
  notes: string;
  tags: string[];
}

/** Totais do período. Receita e despesas incluem os pendentes. */
export interface PeriodTotals {
  income: Cents;
  incomePending: Cents;
  expenses: Cents;
  expensesPending: Cents;
}

export interface MonthlyCashflow {
  month: YearMonth;
  income: Cents;
  expenses: Cents;
}

/** Despesas de uma categoria (`null` = sem categoria). */
export interface CategoryTotal {
  categoryId: number | null;
  total: Cents;
}

export interface FinanceOverview {
  month: YearMonth;
  totals: PeriodTotals;
  /** Últimos 6 meses até `month`, do mais antigo ao mais novo. */
  history: MonthlyCashflow[];
  /** Despesas do mês por categoria, da maior para a menor. */
  expensesByCategory: CategoryTotal[];
}

/** Resumo derivado: saldo e percentual de economia. */
export interface CashflowSummary {
  income: Cents;
  expenses: Cents;
  net: Cents;
  /** Fração economizada da receita (0–1); negativa quando há déficit. */
  savingsRate: number;
}

// ---------------------------------------------------------------- Importação

export type ImportFormat = "ofx" | "c6_card_csv";

export type SuggestionReason =
  "duplicate" | "bill_payment" | "learned_rule" | "card_payment" | "investment";

export interface LineSuggestion {
  include: boolean;
  kind: TransactionKind;
  categoryId: number | null;
  /** Conta do outro lado, quando é transferência. */
  counterpartAccountId: number | null;
  reason: SuggestionReason | null;
}

/** Linha do arquivo, como lida pelo Rust. */
export interface PreviewLine {
  index: number;
  /** OFX: data do lançamento. Fatura: data da compra. */
  date: IsoDate;
  description: string;
  amount: Cents;
  /** Entra na conta (senão, sai). */
  inflow: boolean;
  installment: Installment | null;
  /** Categoria que o banco deu (fatura). */
  sourceCategory: string | null;
  /** Linhas com a mesma chave são parecidas (a categoria escolhida vale para todas). */
  descriptionKey: string | null;
  duplicate: boolean;
  suggestion: LineSuggestion;
}

export interface ImportPreview {
  previewId: number;
  fileName: string;
  format: ImportFormat;
  accountKind: AccountKind | null;
  /** Fatura: vencimento encontrado no nome do arquivo. */
  statementDate: IsoDate | null;
  firstDate: IsoDate;
  lastDate: IsoDate;
  lines: PreviewLine[];
}

/** Escolha da tela para uma linha a importar. */
export interface ImportDecision {
  index: number;
  kind: TransactionKind;
  categoryId: number | null;
  counterpartAccountId: number | null;
}

export interface ImportCommitInput {
  previewId: number;
  accountId: number;
  statementDate: IsoDate | null;
  lines: ImportDecision[];
}

export interface ImportResult {
  added: number;
  /** Escolhidas, mas já importadas antes. */
  duplicates: number;
  /** Linhas do arquivo não escolhidas. */
  skipped: number;
}
