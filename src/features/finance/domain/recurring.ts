import { statusLabel } from "@/features/finance/domain/labels";
import { MAX_AMOUNT_CENTS, parseAmount, toAmountInput } from "@/features/finance/domain/money";
import { type DateRange } from "@/features/finance/domain/period";
import { type TransactionDraft } from "@/features/finance/domain/transaction-draft";
import {
  type OccurrenceRef,
  type OccurrenceStatus,
  type PlannedTotals,
  type RecurringInput,
  type RecurringOccurrence,
  type RecurringOverview,
  type RecurringRule,
  type RecurringSeries,
  type Transaction,
  type TransactionInput,
  type TransactionKind,
} from "@/features/finance/types";
import { addDays, dayOfMonth, daysBetween, weekdayOf } from "@/lib/dates";
import { formatDayMonth } from "@/lib/format";
import { describeRepeat } from "@/lib/recurrence";
import { weekdayLong } from "@/lib/weekdays";
import { type IsoDate } from "@/types/common";
import { type RecurrenceFrequency } from "@/types/recurrence";

/**
 * Recorrentes: formulário, rótulos e vínculo com lançamentos. Os vencimentos,
 * status e resumos vêm prontos do Rust (`domain/finance/recurring.rs`).
 */

/** Limites espelhados de `src-tauri/src/domain/finance/recurring.rs`. */
export const RECURRING_LIMITS = {
  descriptionChars: 120,
  notesChars: 2_000,
  maxInterval: 99,
  maxCount: 999,
} as const;

/** Ordem das frequências no formulário (a mensal é a mais comum). */
export const RECURRING_FREQUENCIES: readonly RecurrenceFrequency[] = [
  "monthly",
  "weekly",
  "yearly",
  "daily",
];

export type RepeatEnd = "never" | "until" | "count";

/** Estado do formulário: valor, intervalo e número de vezes como texto digitado. */
export interface RecurringDraft {
  kind: TransactionKind;
  description: string;
  amountText: string;
  accountId: number | null;
  transferAccountId: number | null;
  categoryId: number | null;
  startDate: IsoDate;
  frequency: RecurrenceFrequency;
  intervalText: string;
  end: RepeatEnd;
  until: IsoDate;
  countText: string;
  notes: string;
}

export type RecurringDraftErrors = Partial<Record<keyof RecurringDraft, string>>;

export function emptyRecurringDraft(accountId: number | null, startDate: IsoDate): RecurringDraft {
  return {
    kind: "expense",
    description: "",
    amountText: "",
    accountId,
    transferAccountId: null,
    categoryId: null,
    startDate,
    frequency: "monthly",
    intervalText: "1",
    end: "never",
    until: "",
    countText: "12",
    notes: "",
  };
}

export function toRecurringDraft(series: RecurringSeries): RecurringDraft {
  const { recurrence } = series;
  return {
    kind: series.kind,
    description: series.description,
    amountText: toAmountInput(series.amount),
    accountId: series.accountId,
    transferAccountId: series.transferAccountId,
    categoryId: series.categoryId,
    startDate: series.startDate,
    frequency: recurrence.frequency,
    intervalText: String(recurrence.interval),
    end: recurrence.until !== null ? "until" : recurrence.count !== null ? "count" : "never",
    until: recurrence.until ?? "",
    countText: String(recurrence.count ?? 12),
    notes: series.notes,
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseWholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/**
 * Valida o formulário para feedback imediato. Retorna os erros e, quando
 * válido, a entrada pronta para o backend (que valida de novo).
 */
export function validateRecurringDraft(draft: RecurringDraft): {
  errors: RecurringDraftErrors;
  input: RecurringInput | null;
} {
  const errors: RecurringDraftErrors = {};
  const description = draft.description.trim();
  if (description === "") errors.description = "Informe uma descrição.";
  else if (description.length > RECURRING_LIMITS.descriptionChars)
    errors.description = `Use no máximo ${RECURRING_LIMITS.descriptionChars} caracteres.`;

  const amount = parseAmount(draft.amountText);
  if (draft.amountText.trim() === "") errors.amountText = "Informe o valor.";
  else if (amount === null) errors.amountText = "Valor inválido. Use o formato 1.234,56.";
  else if (amount <= 0) errors.amountText = "O valor precisa ser maior que zero.";
  else if (amount > MAX_AMOUNT_CENTS) errors.amountText = "Valor acima do limite aceito.";

  if (draft.accountId === null) errors.accountId = "Escolha a conta.";
  if (draft.kind === "transfer") {
    if (draft.transferAccountId === null) errors.transferAccountId = "Escolha a conta de destino.";
    else if (draft.transferAccountId === draft.accountId)
      errors.transferAccountId = "Escolha uma conta diferente da de origem.";
  }
  if (!ISO_DATE.test(draft.startDate)) errors.startDate = "Informe o primeiro vencimento.";

  const interval = parseWholeNumber(draft.intervalText);
  if (interval === null || interval < 1 || interval > RECURRING_LIMITS.maxInterval)
    errors.intervalText = `Use um número de 1 a ${RECURRING_LIMITS.maxInterval}.`;

  let until: IsoDate | null = null;
  let count: number | null = null;
  if (draft.end === "until") {
    if (!ISO_DATE.test(draft.until)) errors.until = "Informe a data final.";
    else if (ISO_DATE.test(draft.startDate) && draft.until < draft.startDate)
      errors.until = "A data final não pode ser antes do primeiro vencimento.";
    else until = draft.until;
  } else if (draft.end === "count") {
    count = parseWholeNumber(draft.countText);
    if (count === null || count < 1 || count > RECURRING_LIMITS.maxCount)
      errors.countText = `Use um número de 1 a ${RECURRING_LIMITS.maxCount}.`;
  }

  const notes = draft.notes.trim();
  if (notes.length > RECURRING_LIMITS.notesChars)
    errors.notes = `Use no máximo ${RECURRING_LIMITS.notesChars} caracteres.`;

  if (
    Object.keys(errors).length > 0 ||
    amount === null ||
    interval === null ||
    draft.accountId === null
  ) {
    return { errors, input: null };
  }
  return {
    errors,
    input: {
      kind: draft.kind,
      description,
      amount,
      accountId: draft.accountId,
      transferAccountId: draft.kind === "transfer" ? draft.transferAccountId : null,
      categoryId: draft.kind === "transfer" ? null : draft.categoryId,
      startDate: draft.startDate,
      recurrence: { frequency: draft.frequency, interval, until, count },
      notes,
    },
  };
}

/** Ex.: "Todo mês · dia 5", "A cada 2 semanas · sexta-feira", "Todo ano · 15/03". */
export function describeSchedule(rule: RecurringRule, startDate: IsoDate): string {
  const base = describeRepeat({ frequency: rule.frequency, interval: rule.interval, weekdays: [] });
  switch (rule.frequency) {
    case "monthly":
      return `${base} · dia ${dayOfMonth(startDate)}`;
    case "weekly":
      return `${base} · ${weekdayLong(weekdayOf(startDate))}`;
    case "yearly":
      return `${base} · ${formatDayMonth(startDate)}`;
    case "daily":
      return base;
  }
}

/** Status do vencimento para exibição, conforme o tipo da série. */
export function occurrenceStatusLabel(status: OccurrenceStatus, kind: TransactionKind): string {
  switch (status) {
    case "open":
      return kind === "income" ? "A receber" : kind === "transfer" ? "A fazer" : "A pagar";
    case "overdue":
      return "Atrasada";
    case "pending":
      return "Registrada";
    case "paid":
      return statusLabel(kind, "paid");
    case "skipped":
      return "Pulada";
  }
}

/** Ação rápida de um vencimento em aberto: "Pagar", "Receber" ou "Transferir". */
export function settleLabel(kind: TransactionKind): string {
  return kind === "income" ? "Receber" : kind === "transfer" ? "Transferir" : "Pagar";
}

/** Vencimento sem lançamento (pode ser registrado, vinculado ou pulado). */
export function isOpen(occurrence: RecurringOccurrence): boolean {
  return (
    occurrence.transactionId === null &&
    (occurrence.status === "open" || occurrence.status === "overdue")
  );
}

export function occurrenceKey(occurrence: OccurrenceRef): string {
  return `${occurrence.recurringId}:${occurrence.occurrenceDate}`;
}

/** Lançamento do vencimento com os dados da série: pago, na data do vencimento. */
export function occurrenceTransaction(
  series: RecurringSeries,
  occurrence: OccurrenceRef,
): TransactionInput {
  return {
    accountId: series.accountId,
    transferAccountId: series.transferAccountId,
    categoryId: series.categoryId,
    kind: series.kind,
    description: series.description,
    amount: series.amount,
    date: occurrence.occurrenceDate,
    status: "paid",
    notes: "",
    tags: [],
  };
}

/** Formulário de lançamento já preenchido com os dados do vencimento. */
export function occurrenceDraft(
  series: RecurringSeries,
  occurrence: OccurrenceRef,
): TransactionDraft {
  const { amount, ...input } = occurrenceTransaction(series, occurrence);
  return { ...input, amountText: toAmountInput(amount) };
}

/** Distância máxima (em dias) entre o vencimento e um lançamento a vincular. */
export const LINK_WINDOW_DAYS = 15;

export function linkRange(occurrenceDate: IsoDate): DateRange {
  return {
    from: addDays(occurrenceDate, -LINK_WINDOW_DAYS),
    to: addDays(occurrenceDate, LINK_WINDOW_DAYS),
  };
}

/**
 * Lançamentos que podem ser vinculados ao vencimento: mesmo tipo, sem outro
 * vínculo e até `LINK_WINDOW_DAYS` dias de distância. Os de valor mais
 * parecido vêm primeiro; no empate, os de data mais próxima.
 */
export function linkCandidates(
  transactions: readonly Transaction[],
  series: RecurringSeries,
  occurrenceDate: IsoDate,
): Transaction[] {
  const distance = (transaction: Transaction) =>
    Math.abs(daysBetween(occurrenceDate, transaction.date));
  return transactions
    .filter(
      (transaction) =>
        transaction.kind === series.kind &&
        transaction.recurringId === null &&
        distance(transaction) <= LINK_WINDOW_DAYS,
    )
    .sort(
      (a, b) =>
        Math.abs(a.amount - series.amount) - Math.abs(b.amount - series.amount) ||
        distance(a) - distance(b) ||
        a.id - b.id,
    );
}

/** Quanto do previsto no período ainda falta pagar e receber. */
export function plannedRemaining(totals: PlannedTotals): { expenses: number; income: number } {
  return {
    expenses: totals.expenses - totals.expensesPaid,
    income: totals.income - totals.incomePaid,
  };
}
/** Dias à frente mostrados no dashboard. */
export const UPCOMING_DAYS = 14;

export interface UpcomingBill {
  series: RecurringSeries;
  occurrence: RecurringOccurrence;
}

/**
 * O que ainda precisa de atenção: atrasados primeiro (do mais antigo), depois
 * os em aberto ou pendentes por data. Pagos e pulados ficam de fora.
 */
export function upcomingBills(overview: RecurringOverview, limit: number): UpcomingBill[] {
  const series = new Map(overview.series.map((item) => [item.id, item]));
  const pending = (occurrence: RecurringOccurrence) =>
    occurrence.status !== "paid" && occurrence.status !== "skipped";
  const rank = (occurrence: RecurringOccurrence) => (occurrence.status === "overdue" ? 0 : 1);
  return [...overview.overdue, ...overview.occurrences]
    .filter(pending)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        a.occurrenceDate.localeCompare(b.occurrenceDate) ||
        a.recurringId - b.recurringId,
    )
    .flatMap((occurrence) => {
      const owner = series.get(occurrence.recurringId);
      return owner ? [{ series: owner, occurrence }] : [];
    })
    .slice(0, limit);
}
