import { describe, expect, it } from "vitest";

import {
  buildCommit,
  chooseRecurring,
  type ImportChoices,
  initialChoices,
} from "@/features/finance/domain/import";
import {
  describeSchedule,
  emptyRecurringDraft,
  isOpen,
  linkCandidates,
  occurrenceDraft,
  occurrenceStatusLabel,
  occurrenceTransaction,
  plannedRemaining,
  toRecurringDraft,
  upcomingBills,
  validateRecurringDraft,
} from "@/features/finance/domain/recurring";
import {
  type ImportPreview,
  type PreviewLine,
  type RecurringOccurrence,
  type RecurringOverview,
  type RecurringSeries,
  type Transaction,
} from "@/features/finance/types";

function series(partial: Partial<RecurringSeries> = {}): RecurringSeries {
  return {
    id: 1,
    kind: "expense",
    description: "Aluguel",
    amount: 200_000,
    accountId: 1,
    transferAccountId: null,
    categoryId: 1,
    startDate: "2026-09-05",
    recurrence: { frequency: "monthly", interval: 1, until: null, count: null },
    notes: "",
    onCard: false,
    nextDate: "2026-10-05",
    lastDate: null,
    ended: false,
    endsSoon: false,
    overdueCount: 0,
    lastResolvedDate: null,
    monthlyAmount: 200_000,
    createdAt: "2026-09-01T12:00:00Z",
    updatedAt: "2026-09-01T12:00:00Z",
    ...partial,
  };
}

function occurrence(partial: Partial<RecurringOccurrence> = {}): RecurringOccurrence {
  return {
    recurringId: 1,
    occurrenceDate: "2026-10-05",
    status: "open",
    amount: 200_000,
    transactionId: null,
    transactionDate: null,
    statementDate: null,
    ...partial,
  };
}

function transaction(partial: Partial<Transaction>): Transaction {
  return {
    id: 1,
    accountId: 1,
    transferAccountId: null,
    categoryId: null,
    kind: "expense",
    description: "PIX",
    amount: 200_000,
    date: "2026-10-05",
    status: "paid",
    notes: "",
    tags: [],
    purchaseDate: null,
    installment: null,
    imported: false,
    recurringId: null,
    investmentAssetId: null,
    createdAt: "2026-10-05T12:00:00Z",
    updatedAt: "2026-10-05T12:00:00Z",
    ...partial,
  };
}

describe("formulário de recorrente", () => {
  const filled = {
    ...emptyRecurringDraft(1, "2026-10-05"),
    description: "  Internet ",
    amountText: "99,90",
  };

  it("monta a entrada com a regra de repetição", () => {
    expect(validateRecurringDraft(filled).input).toEqual({
      kind: "expense",
      description: "Internet",
      amount: 9_990,
      accountId: 1,
      transferAccountId: null,
      categoryId: null,
      startDate: "2026-10-05",
      recurrence: { frequency: "monthly", interval: 1, until: null, count: null },
      notes: "",
    });
    const limited = validateRecurringDraft({ ...filled, end: "count", countText: "12" });
    expect(limited.input?.recurrence).toMatchObject({ until: null, count: 12 });
    const until = validateRecurringDraft({ ...filled, end: "until", until: "2027-06-30" });
    expect(until.input?.recurrence).toMatchObject({ until: "2027-06-30", count: null });
  });

  it("aponta os campos inválidos", () => {
    const { errors, input } = validateRecurringDraft({
      ...emptyRecurringDraft(null, ""),
      intervalText: "0",
      end: "until",
      until: "",
    });
    expect(input).toBeNull();
    expect(Object.keys(errors).sort()).toEqual([
      "accountId",
      "amountText",
      "description",
      "intervalText",
      "startDate",
      "until",
    ]);
    expect(
      validateRecurringDraft({ ...filled, end: "until", until: "2026-10-01" }).errors.until,
    ).toMatch(/antes do primeiro vencimento/);
    expect(
      validateRecurringDraft({ ...filled, end: "count", countText: "1000" }).errors.countText,
    ).toBeDefined();
    const transfer = validateRecurringDraft({ ...filled, kind: "transfer", categoryId: 3 });
    expect(transfer.errors.transferAccountId).toBe("Escolha a conta de destino.");
  });

  it("volta ao formulário a partir da série", () => {
    const draft = toRecurringDraft(
      series({ recurrence: { frequency: "yearly", interval: 2, until: null, count: 5 } }),
    );
    expect(draft).toMatchObject({
      frequency: "yearly",
      intervalText: "2",
      end: "count",
      countText: "5",
      amountText: "2000,00",
    });
  });
});

describe("vencimentos", () => {
  it("descreve a repetição", () => {
    const rule = { frequency: "monthly", interval: 1, until: null, count: null } as const;
    expect(describeSchedule(rule, "2026-09-05")).toBe("Todo mês · dia 5");
    expect(describeSchedule({ ...rule, interval: 3 }, "2026-09-05")).toBe("A cada 3 meses · dia 5");
    expect(describeSchedule({ ...rule, frequency: "yearly" }, "2026-03-15")).toBe(
      "Todo ano · 15/03",
    );
    expect(describeSchedule({ ...rule, frequency: "weekly" }, "2026-09-25")).toMatch(
      /^Toda semana · sexta/,
    );
  });

  it("rotula o status pelo tipo", () => {
    const expense = { kind: "expense", onCard: false } as const;
    const card = { kind: "expense", onCard: true } as const;
    expect(occurrenceStatusLabel("open", expense)).toBe("A pagar");
    expect(occurrenceStatusLabel("open", { kind: "income", onCard: false })).toBe("A receber");
    expect(occurrenceStatusLabel("paid", { kind: "income", onCard: false })).toBe("Recebido");
    expect(occurrenceStatusLabel("overdue", expense)).toBe("Atrasada");
    // No cartão: prevista, aguardando a fatura e, com o vínculo, na fatura.
    expect(occurrenceStatusLabel("open", card)).toBe("Prevista");
    expect(occurrenceStatusLabel("awaiting_statement", card)).toBe("Aguardando fatura");
    expect(occurrenceStatusLabel("paid", card)).toBe("Na fatura");
    expect(isOpen(occurrence({ status: "awaiting_statement" }))).toBe(true);
    expect(isOpen(occurrence())).toBe(true);
    // Atrasado com lançamento pendente não pode ser registrado de novo.
    expect(isOpen(occurrence({ status: "overdue", transactionId: 3 }))).toBe(false);
  });

  it("monta o lançamento do vencimento com os dados da série", () => {
    const rent = series();
    const due = occurrence();
    expect(occurrenceTransaction(rent, due)).toEqual({
      accountId: 1,
      transferAccountId: null,
      categoryId: 1,
      kind: "expense",
      description: "Aluguel",
      amount: 200_000,
      date: "2026-10-05",
      status: "paid",
      notes: "",
      tags: [],
    });
    expect(occurrenceDraft(rent, due)).toMatchObject({ amountText: "2000,00", status: "paid" });
    expect(
      plannedRemaining({ expenses: 300, expensesRealized: 100, income: 50, incomeRealized: 50 }),
    ).toEqual({ expenses: 200, income: 0 });
  });

  it("sugere lançamentos para vincular: mesmo tipo, sem vínculo e perto da data", () => {
    const candidates = linkCandidates(
      [
        transaction({ id: 1, amount: 190_000, date: "2026-10-06" }),
        transaction({ id: 2, amount: 200_000, date: "2026-10-12" }),
        transaction({ id: 3, kind: "income", date: "2026-10-05" }),
        transaction({ id: 4, recurringId: 9, date: "2026-10-05" }),
        transaction({ id: 5, date: "2026-10-25" }),
      ],
      series(),
      "2026-10-05",
    );
    expect(candidates.map((item) => item.id)).toEqual([2, 1]);
  });

  it("lista o que precisa de atenção no dashboard", () => {
    const overview: RecurringOverview = {
      today: "2026-10-01",
      series: [
        series(),
        series({ id: 2, description: "Internet" }),
        series({ id: 3, description: "Streaming", onCard: true }),
      ],
      occurrences: [
        occurrence({ occurrenceDate: "2026-10-05" }),
        occurrence({ recurringId: 2, occurrenceDate: "2026-10-02", status: "paid" }),
        occurrence({ recurringId: 2, occurrenceDate: "2026-10-03", status: "pending" }),
        occurrence({ recurringId: 7, occurrenceDate: "2026-10-04" }),
        // No cartão: fica de fora (vem na fatura).
        occurrence({ recurringId: 3, occurrenceDate: "2026-10-02" }),
      ],
      overdue: [occurrence({ occurrenceDate: "2026-09-05", status: "overdue" })],
      totals: { expenses: 0, expensesRealized: 0, income: 0, incomeRealized: 0 },
      summary: {
        monthlyExpenses: 0,
        monthlyCardExpenses: 0,
        monthlyIncome: 0,
        overdueCount: 1,
        overdueExpenses: 200_000,
        overdueIncome: 0,
      },
    };
    const dates = upcomingBills(overview, 5).map((bill) => bill.occurrence.occurrenceDate);
    expect(dates).toEqual(["2026-09-05", "2026-10-03", "2026-10-05"]);
    expect(upcomingBills(overview, 1)).toHaveLength(1);
  });
});

describe("importação com recorrentes", () => {
  const candidate = {
    recurringId: 1,
    occurrenceDate: "2026-10-05",
    description: "Aluguel",
    amount: 200_000,
    categoryId: 1,
  };
  const line = (index: number, partial: Partial<PreviewLine> = {}): PreviewLine => ({
    index,
    date: "2026-10-06",
    description: `Linha ${index}`,
    amount: 200_000,
    inflow: false,
    installment: null,
    sourceCategory: null,
    descriptionKey: null,
    duplicate: false,
    recurringCandidates: [candidate],
    suggestion: {
      include: true,
      kind: "expense",
      categoryId: null,
      counterpartAccountId: null,
      reason: null,
      recurring: null,
    },
    ...partial,
  });
  const preview = (lines: PreviewLine[]): ImportPreview => ({
    previewId: 3,
    fileName: "extrato.ofx",
    format: "ofx",
    accountKind: "checking",
    statementDate: null,
    firstDate: "2026-10-01",
    lastDate: "2026-10-31",
    lines,
  });

  it("vincular preenche a categoria vazia e desfazer mantém o resto", () => {
    const loaded = preview([line(0)]);
    const choice = initialChoices(loaded)[0];
    if (!choice) throw new Error("sem escolha");
    const linked = chooseRecurring(line(0), choice, candidate);
    expect(linked).toMatchObject({
      categoryId: 1,
      recurring: { recurringId: 1, occurrenceDate: "2026-10-05" },
    });
    expect(chooseRecurring(line(0), { ...choice, categoryId: 2 }, candidate).categoryId).toBe(2);
    expect(chooseRecurring(line(0), linked, null)).toMatchObject({
      categoryId: 1,
      recurring: null,
    });
  });

  it("não deixa o mesmo vencimento em duas linhas", () => {
    const loaded = preview([line(0), line(1)]);
    const ref = { recurringId: 1, occurrenceDate: "2026-10-05" };
    const [first, second] = [0, 1].map((index) => initialChoices(loaded)[index]);
    if (!first || !second) throw new Error("sem escolhas");
    const twice: ImportChoices = {
      0: { ...first, recurring: ref },
      1: { ...second, recurring: ref },
    };
    expect(buildCommit(loaded, twice, 1, null).problem).toMatch(/mesmo vencimento/);
    const once: ImportChoices = { ...twice, 1: second };
    expect(buildCommit(loaded, once, 1, null).input?.lines[0]?.recurring).toEqual(ref);
  });
});
