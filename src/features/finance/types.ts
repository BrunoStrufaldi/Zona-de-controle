import { type IsoDate, type IsoDateTime } from "@/types/common";
import { type CategoryColor } from "@/types/palette";
import { type RecurrenceFrequency } from "@/types/recurrence";

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
  /** Só cartão de crédito: dia de fechamento e de vencimento da fatura. */
  closingDay: number | null;
  dueDay: number | null;
}

export interface AccountInput {
  name: string;
  kind: AccountKind;
  color: CategoryColor;
  openingBalance: Cents;
  /** Só cartão de crédito: os dois juntos ou nenhum. */
  closingDay: number | null;
  dueDay: number | null;
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
  /** Vinculado a um vencimento desta recorrente. */
  recurringId: number | null;
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
  "duplicate" | "bill_payment" | "learned_rule" | "card_payment" | "investment" | "recurring";

/** Vencimento de uma recorrente (identificado pela data original). */
export interface OccurrenceRef {
  recurringId: number;
  occurrenceDate: IsoDate;
}

/** Vencimento em aberto que combina com uma linha do arquivo. */
export interface RecurringCandidate extends OccurrenceRef {
  description: string;
  /** Valor previsto. */
  amount: Cents;
  categoryId: number | null;
}

export interface LineSuggestion {
  include: boolean;
  kind: TransactionKind;
  categoryId: number | null;
  /** Conta do outro lado, quando é transferência. */
  counterpartAccountId: number | null;
  reason: SuggestionReason | null;
  /** Vencimento de recorrente a vincular. */
  recurring: OccurrenceRef | null;
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
  /** Vencimentos de recorrentes que combinam com a linha (o melhor primeiro). */
  recurringCandidates: RecurringCandidate[];
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
  /** Só entrada/saída: vencimento de recorrente a vincular. */
  recurring: OccurrenceRef | null;
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
  /** Importadas e vinculadas a um vencimento de recorrente. */
  linked: number;
}

// ---------------------------------------------------------------- Recorrentes

/**
 * Repetição a cada `interval` dias/semanas/meses/anos a partir do primeiro
 * vencimento; termina, opcionalmente, em `until` (inclusive) ou após `count`
 * vencimentos. Mensal no dia 31 usa o último dia dos meses curtos.
 */
export interface RecurringRule {
  frequency: RecurrenceFrequency;
  interval: number;
  until: IsoDate | null;
  count: number | null;
}

/** Conta fixa ou receita que se repete (espelha `RecurringSeriesView`). */
export interface RecurringSeries {
  id: number;
  kind: TransactionKind;
  description: string;
  /** Valor previsto. */
  amount: Cents;
  accountId: number;
  transferAccountId: number | null;
  categoryId: number | null;
  /** Primeiro vencimento acompanhado. */
  startDate: IsoDate;
  recurrence: RecurringRule;
  notes: string;
  /** A conta é um cartão de crédito: cobrada na fatura, sem pagamento um a um. */
  onCard: boolean;
  /** Próximo vencimento em aberto (de hoje em diante). */
  nextDate: IsoDate | null;
  /** Último vencimento, quando a repetição termina. */
  lastDate: IsoDate | null;
  ended: boolean;
  /** Termina em até 30 dias (hora de renovar ou cancelar). */
  endsSoon: boolean;
  overdueCount: number;
  /** Vencimento resolvido mais recente: mudar a repetição só vale depois dele. */
  lastResolvedDate: IsoDate | null;
  /** Valor equivalente por mês. */
  monthlyAmount: Cents;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface RecurringInput {
  kind: TransactionKind;
  description: string;
  amount: Cents;
  accountId: number;
  transferAccountId: number | null;
  categoryId: number | null;
  startDate: IsoDate;
  recurrence: RecurringRule;
  notes: string;
}

/**
 * `open`: a vencer, sem lançamento. `overdue`: venceu sem lançamento ou com o
 * lançamento ainda pendente. `pending`: lançamento pendente no prazo.
 * `paid`: lançamento pago/recebido (no cartão: já na fatura). `skipped`: pulado.
 * `awaiting_statement`: no cartão, o dia passou e a fatura ainda não foi
 * importada (nunca "atrasado").
 */
export type OccurrenceStatus =
  "open" | "overdue" | "pending" | "paid" | "skipped" | "awaiting_statement";

export interface RecurringOccurrence extends OccurrenceRef {
  status: OccurrenceStatus;
  /** Do lançamento vinculado; senão, o valor previsto. */
  amount: Cents;
  transactionId: number | null;
  transactionDate: IsoDate | null;
  /**
   * No cartão com os dias da fatura, sem lançamento: vencimento da fatura em
   * que a cobrança cai (data sugerida ao lançar à mão).
   */
  statementDate: IsoDate | null;
}

/**
 * Previsto e realizado no período (sem transferências e sem os pulados).
 * Realizado = pago/recebido ou, no cartão, já na fatura.
 */
export interface PlannedTotals {
  expenses: Cents;
  expensesRealized: Cents;
  income: Cents;
  incomeRealized: Cents;
}

export interface RecurringSummary {
  /** Soma do equivalente mensal das recorrentes ativas. */
  monthlyExpenses: Cents;
  /** Parte de `monthlyExpenses` cobrada no cartão. */
  monthlyCardExpenses: Cents;
  monthlyIncome: Cents;
  /** Todos os atrasados (inclusive os do período). */
  overdueCount: number;
  overdueExpenses: Cents;
  overdueIncome: Cents;
}

export interface RecurringOverview {
  today: IsoDate;
  /** Ativas primeiro (pelo próximo vencimento); encerradas no fim. */
  series: RecurringSeries[];
  /** Vencimentos do período, por data. */
  occurrences: RecurringOccurrence[];
  /** Atrasados de antes do período. */
  overdue: RecurringOccurrence[];
  totals: PlannedTotals;
  summary: RecurringSummary;
}

// ---------------------------------------------------------------- Parcelamentos

/** Compra parcelada (parcelas das faturas importadas, agrupadas no Rust). */
export interface InstallmentPurchase {
  /** Chave estável do agrupamento. */
  id: string;
  accountId: number;
  categoryId: number | null;
  description: string;
  purchaseDate: IsoDate | null;
  /** Valor da parcela (o da mais recente). */
  installmentAmount: Cents;
  count: number;
  /** Parcelas com vencimento antes de hoje. */
  paid: number;
  /** Próxima parcela a vencer. */
  current: number | null;
  remaining: number;
  remainingAmount: Cents;
  totalAmount: Cents;
  /** Parcelas que já vieram em faturas importadas. */
  imported: number;
  firstDueDate: IsoDate;
  nextDueDate: IsoDate | null;
  finalDueDate: IsoDate;
  finished: boolean;
}

/** Quanto das faturas de um mês (pelo vencimento) já está comprometido. */
export interface CommitmentMonth {
  month: YearMonth;
  installments: Cents;
  parcels: number;
  /** Recorrentes no cartão previstas para as faturas do mês. */
  recurring: Cents;
  /** Ids das compras cuja última parcela vence no mês. */
  ending: string[];
}

export interface InstallmentsSummary {
  activePurchases: number;
  remainingParcels: number;
  remainingAmount: Cents;
  /** Parcelas + recorrentes no cartão com vencimento no mês atual. */
  currentMonth: Cents;
}

export interface InstallmentsOverview {
  today: IsoDate;
  /** Ativas (a que termina antes primeiro) e depois as encerradas mais recentes. */
  purchases: InstallmentPurchase[];
  /** O mês atual e os 11 seguintes. */
  months: CommitmentMonth[];
  summary: InstallmentsSummary;
  /** Mês da última parcela de todas as compras ativas. */
  finalMonth: YearMonth | null;
  /** Cartões com recorrentes mas sem os dias da fatura (fora do compromisso). */
  cardsWithoutCycle: number[];
}
