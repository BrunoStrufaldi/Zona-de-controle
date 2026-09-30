import { describe, expect, it } from "vitest";

import {
  balanceEffect,
  isOverdue,
  summarizeCashflow,
  summarizeTransactions,
} from "@/features/finance/domain/cashflow";
import { categoryShares, suggestColor, validateName } from "@/features/finance/domain/categories";
import {
  DEFAULT_TRANSACTION_FILTERS,
  filterTransactions,
  hasActiveFilters,
  indexById,
} from "@/features/finance/domain/filters";
import {
  applyCategory,
  buildCommit,
  changeLineKind,
  countChoices,
  initialChoices,
  kindOptions,
  pickAccount,
} from "@/features/finance/domain/import";
import { statusLabel } from "@/features/finance/domain/labels";
import { parseAmount, parseSignedAmount, toAmountInput } from "@/features/finance/domain/money";
import {
  defaultDateFor,
  monthRange,
  periodLabel,
  periodRange,
  shiftMonth,
  shiftPeriod,
} from "@/features/finance/domain/period";
import {
  changeKind,
  emptyTransactionDraft,
  toTransactionDraft,
  validateTransactionDraft,
} from "@/features/finance/domain/transaction-draft";
import {
  type FinanceAccount,
  type FinanceCategory,
  type ImportPreview,
  type PreviewLine,
  type Transaction,
} from "@/features/finance/types";

const categories: FinanceCategory[] = [
  { id: 1, kind: "expense", name: "Alimentação", color: "orange", transactionCount: 0 },
  { id: 2, kind: "expense", name: "Moradia", color: "blue", transactionCount: 0 },
  { id: 3, kind: "income", name: "Salário", color: "green", transactionCount: 0 },
];

const accounts: FinanceAccount[] = [
  {
    id: 1,
    name: "C6",
    kind: "checking",
    color: "slate",
    openingBalance: 0,
    balance: 0,
    transactionCount: 0,
  },
  {
    id: 2,
    name: "Nubank",
    kind: "credit_card",
    color: "violet",
    openingBalance: 0,
    balance: 0,
    transactionCount: 0,
  },
];

function transaction(partial: Partial<Transaction>): Transaction {
  return {
    id: 1,
    accountId: 1,
    transferAccountId: null,
    categoryId: null,
    kind: "expense",
    description: "Lançamento",
    amount: 1_000,
    date: "2026-09-10",
    status: "paid",
    notes: "",
    tags: [],
    purchaseDate: null,
    installment: null,
    imported: false,
    recurringId: null,
    createdAt: "2026-09-10T12:00:00Z",
    updatedAt: "2026-09-10T12:00:00Z",
    ...partial,
  };
}

describe("valores", () => {
  it("converte o valor digitado em centavos", () => {
    expect(parseAmount("1.234,56")).toBe(123_456);
    expect(parseAmount("1234,5")).toBe(123_450);
    expect(parseAmount("R$ 50")).toBe(5_000);
    expect(parseAmount("12.50")).toBe(1_250);
    expect(parseAmount("1.23")).toBe(123);
    // Sem vírgula, ponto seguido de 3 dígitos é milhar.
    expect(parseAmount("1.234")).toBe(123_400);
    expect(parseAmount("12.345.678")).toBe(1_234_567_800);
    expect(parseAmount("0,00")).toBe(0);
  });

  it("recusa textos que não são valores", () => {
    for (const invalid of ["", "  ", "abc", "1,234.56", "12,345", "1.2.3", "-5", "1,2,3"]) {
      expect(parseAmount(invalid), invalid).toBeNull();
    }
  });

  it("aceita saldo inicial negativo e formata para edição", () => {
    expect(parseSignedAmount("-1.500,00")).toBe(-150_000);
    expect(parseSignedAmount("")).toBe(0);
    expect(parseSignedAmount("-")).toBeNull();
    expect(toAmountInput(123_456)).toBe("1234,56");
    expect(toAmountInput(-5)).toBe("-0,05");
  });
});

describe("períodos", () => {
  it("anda por meses e anos", () => {
    expect(shiftMonth("2026-09", 4)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthRange("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(periodRange({ kind: "year", year: 2026 })).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(shiftPeriod({ kind: "year", year: 2026 }, -1)).toEqual({ kind: "year", year: 2025 });
    expect(periodLabel({ kind: "month", month: "2026-09" })).toBe("setembro de 2026");
  });

  it("sugere hoje só quando está no período exibido", () => {
    expect(defaultDateFor({ kind: "month", month: "2026-09" }, "2026-09-28")).toBe("2026-09-28");
    expect(defaultDateFor({ kind: "month", month: "2026-08" }, "2026-09-28")).toBe("2026-08-01");
  });
});

describe("resumos", () => {
  it("resume receita, despesas, saldo e economia (em centavos)", () => {
    expect(summarizeCashflow(1_000_000, 750_000)).toEqual({
      income: 1_000_000,
      expenses: 750_000,
      net: 250_000,
      savingsRate: 0.25,
    });
    expect(summarizeCashflow(100_000, 150_000).savingsRate).toBe(-0.5);
    expect(summarizeCashflow(0, 30_000).savingsRate).toBe(0);
  });

  it("soma as entradas e saídas de uma lista", () => {
    const summary = summarizeTransactions([
      transaction({ kind: "income", amount: 800_000 }),
      transaction({ amount: 120_000 }),
      transaction({ amount: 30_000, status: "pending" }),
    ]);
    expect(summary).toMatchObject({ income: 800_000, expenses: 150_000, net: 650_000 });
  });

  it("pendente com data passada está atrasado", () => {
    expect(isOverdue({ status: "pending", date: "2026-09-27" }, "2026-09-28")).toBe(true);
    expect(isOverdue({ status: "pending", date: "2026-09-28" }, "2026-09-28")).toBe(false);
    expect(isOverdue({ status: "paid", date: "2026-09-01" }, "2026-09-28")).toBe(false);
  });

  it("calcula a participação de cada categoria nas despesas", () => {
    const shares = categoryShares(
      [
        { categoryId: 2, total: 150_000 },
        { categoryId: null, total: 50_000 },
      ],
      indexById(categories),
    );
    expect(shares).toEqual([
      { id: 2, name: "Moradia", color: "blue", total: 150_000, share: 0.75 },
      { id: null, name: "Sem categoria", color: null, total: 50_000, share: 0.25 },
    ]);
  });

  it("usa Pago ou Recebido conforme o tipo", () => {
    expect(statusLabel("expense", "paid")).toBe("Pago");
    expect(statusLabel("income", "paid")).toBe("Recebido");
    expect(statusLabel("income", "pending")).toBe("Pendente");
  });
});

describe("filtros de lançamentos", () => {
  const list = [
    transaction({ id: 1, description: "Mercado", categoryId: 1, amount: 45_000, tags: ["casa"] }),
    transaction({
      id: 2,
      description: "Aluguel",
      categoryId: 2,
      amount: 200_000,
      status: "pending",
    }),
    transaction({ id: 3, description: "Salário", kind: "income", categoryId: 3, amount: 800_000 }),
    transaction({ id: 4, description: "Cinema", accountId: 2, amount: 6_000 }),
  ];
  const context = { accounts: indexById(accounts), categories: indexById(categories) };
  const ids = (filters: Partial<typeof DEFAULT_TRANSACTION_FILTERS>) =>
    filterTransactions(list, { ...DEFAULT_TRANSACTION_FILTERS, ...filters }, context).map(
      (item) => item.id,
    );

  it("filtra por tipo, status, categoria, conta e faixa de valor", () => {
    expect(ids({})).toEqual([1, 2, 3, 4]);
    expect(ids({ kind: "income" })).toEqual([3]);
    expect(ids({ status: "pending" })).toEqual([2]);
    expect(ids({ category: 1 })).toEqual([1]);
    expect(ids({ category: "none" })).toEqual([4]);
    expect(ids({ accountId: 2 })).toEqual([4]);
    expect(ids({ minAmount: "100", maxAmount: "2.000,00" })).toEqual([1, 2]);
    // Faixa inválida é ignorada (sem limite).
    expect(ids({ minAmount: "abc" })).toEqual([1, 2, 3, 4]);
  });

  it("busca sem acentos na descrição, tags, categoria e conta", () => {
    expect(ids({ search: "salario" })).toEqual([3]);
    expect(ids({ search: "CASA" })).toEqual([1]);
    expect(ids({ search: "alimentacao" })).toEqual([1]);
    expect(ids({ search: "nubank" })).toEqual([4]);
  });

  it("sabe quando há filtros ativos", () => {
    expect(hasActiveFilters(DEFAULT_TRANSACTION_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_TRANSACTION_FILTERS, maxAmount: "10" })).toBe(true);
  });
});

describe("formulário de lançamento", () => {
  it("valida e converte o rascunho", () => {
    const draft = {
      ...emptyTransactionDraft(1, "2026-09-28"),
      description: "  Mercado ",
      amountText: "453,90",
      tags: ["casa"],
    };
    expect(validateTransactionDraft(draft)).toEqual({
      errors: {},
      input: {
        accountId: 1,
        transferAccountId: null,
        categoryId: null,
        kind: "expense",
        description: "Mercado",
        amount: 45_390,
        date: "2026-09-28",
        status: "paid",
        notes: "",
        tags: ["casa"],
      },
    });
  });

  it("aponta os campos inválidos", () => {
    const { errors, input } = validateTransactionDraft({
      ...emptyTransactionDraft(null, ""),
      amountText: "0",
    });
    expect(input).toBeNull();
    expect(errors).toEqual({
      description: "Informe uma descrição.",
      amountText: "O valor precisa ser maior que zero.",
      accountId: "Escolha a conta.",
      date: "Informe a data.",
    });
    expect(
      validateTransactionDraft({ ...emptyTransactionDraft(1, "2026-09-28"), amountText: "1,2,3" })
        .errors.amountText,
    ).toMatch(/Valor inválido/);
  });

  it("limpa a categoria ao trocar para um tipo que não combina", () => {
    const index = indexById(categories);
    const draft = { ...emptyTransactionDraft(1, "2026-09-28"), categoryId: 1 };
    expect(changeKind(draft, "income", index)).toMatchObject({ kind: "income", categoryId: null });
    expect(changeKind(draft, "expense", index).categoryId).toBe(1);
  });

  it("carrega um lançamento para edição", () => {
    expect(toTransactionDraft(transaction({ amount: 123_456, tags: ["a"] }))).toMatchObject({
      amountText: "1234,56",
      tags: ["a"],
    });
  });
});

describe("categorias e contas", () => {
  it("valida nomes únicos sem diferenciar maiúsculas", () => {
    const message = (name: string) => `duplicado: ${name}`;
    expect(validateName("  moradia ", categories, null, 40, message)).toBe("duplicado: moradia");
    expect(validateName("Moradia", categories, 2, 40, message)).toBeNull();
    expect(validateName("   ", categories, null, 40, message)).toBe("Informe um nome.");
    expect(validateName("x".repeat(41), categories, null, 40, message)).toMatch(/no máximo 40/);
  });

  it("sugere uma cor ainda não usada", () => {
    expect(suggestColor([{ color: "red" }, { color: "orange" }])).toBe("amber");
  });
});

describe("transferências", () => {
  it("move o saldo da conta de origem para a de destino", () => {
    const transfer = {
      kind: "transfer",
      amount: 10_000,
      accountId: 1,
      transferAccountId: 2,
    } as const;
    expect(balanceEffect(transfer, 1)).toBe(-10_000);
    expect(balanceEffect(transfer, 2)).toBe(10_000);
    expect(balanceEffect(transfer, 3)).toBe(0);
    expect(
      balanceEffect({ kind: "income", amount: 500, accountId: 1, transferAccountId: null }, 1),
    ).toBe(500);
  });

  it("aparece no filtro das duas contas e fica fora de 'Sem categoria' e dos totais", () => {
    const list = [
      transaction({ id: 1, kind: "transfer", accountId: 1, transferAccountId: 2, amount: 9_000 }),
      transaction({ id: 2, amount: 1_000 }),
    ];
    const context = { accounts: indexById(accounts), categories: indexById(categories) };
    const ids = (filters: Partial<typeof DEFAULT_TRANSACTION_FILTERS>) =>
      filterTransactions(list, { ...DEFAULT_TRANSACTION_FILTERS, ...filters }, context).map(
        (item) => item.id,
      );
    expect(ids({ accountId: 2 })).toEqual([1]);
    expect(ids({ category: "none" })).toEqual([2]);
    expect(ids({ kind: "transfer" })).toEqual([1]);
    expect(summarizeTransactions(list)).toMatchObject({ income: 0, expenses: 1_000 });
  });

  it("exige a conta de destino diferente da de origem", () => {
    const draft = {
      ...emptyTransactionDraft(1, "2026-09-28", "transfer"),
      description: "Fatura",
      amountText: "100",
    };
    expect(validateTransactionDraft(draft).errors.transferAccountId).toBe(
      "Escolha a conta de destino.",
    );
    expect(
      validateTransactionDraft({ ...draft, transferAccountId: 1 }).errors.transferAccountId,
    ).toMatch(/diferente/);
    expect(
      validateTransactionDraft({ ...draft, transferAccountId: 2, categoryId: 5 }).input,
    ).toMatchObject({
      kind: "transfer",
      transferAccountId: 2,
      categoryId: null,
    });
  });
});

describe("importação", () => {
  const line = (partial: Partial<PreviewLine>): PreviewLine => ({
    index: 0,
    date: "2026-09-10",
    description: "Linha",
    amount: 1_000,
    inflow: false,
    installment: null,
    sourceCategory: null,
    descriptionKey: null,
    duplicate: false,
    suggestion: {
      include: true,
      kind: "expense",
      categoryId: null,
      counterpartAccountId: null,
      reason: null,
      recurring: null,
    },
    recurringCandidates: [],
    ...partial,
  });
  const preview = (
    lines: PreviewLine[],
    format: ImportPreview["format"] = "ofx",
  ): ImportPreview => ({
    previewId: 7,
    fileName: "extrato.ofx",
    format,
    accountKind: "checking",
    statementDate: null,
    firstDate: "2026-09-01",
    lastDate: "2026-09-30",
    lines,
  });

  it("começa pelas sugestões e nunca inclui duplicados", () => {
    const loaded = preview([
      line({ index: 0 }),
      line({ index: 1, duplicate: true }),
      line({ index: 2, suggestion: { ...line({}).suggestion, include: false } }),
    ]);
    const choices = initialChoices(loaded);
    expect(choices[1]?.include).toBe(false);
    expect(countChoices(loaded, choices)).toEqual({
      selected: 1,
      duplicates: 1,
      left: 1,
      linked: 0,
    });
  });

  it("limita os tipos pelo sentido do valor e limpa o que não vale mais", () => {
    expect(kindOptions({ inflow: true })).toEqual(["income", "transfer"]);
    expect(kindOptions({ inflow: false })).toEqual(["expense", "transfer"]);
    const choice = {
      include: true,
      kind: "expense",
      categoryId: 3,
      counterpartAccountId: null,
      recurring: null,
    } as const;
    expect(changeLineKind(choice, "transfer")).toMatchObject({
      kind: "transfer",
      categoryId: null,
    });
  });

  it("sugere a conta pelo tipo do arquivo", () => {
    expect(pickAccount(accounts, "credit_card")).toBe(2);
    expect(pickAccount(accounts, null)).toBeNull();
    expect(pickAccount(accounts.slice(0, 1), "credit_card")).toBe(1);
  });

  it("monta o pedido só com as linhas marcadas e aponta o que falta", () => {
    const loaded = preview([
      line({ index: 0 }),
      line({ index: 1, inflow: true }),
      line({ index: 2, duplicate: true }),
    ]);
    const choices = {
      ...initialChoices(loaded),
      1: {
        include: true,
        kind: "transfer",
        categoryId: 4,
        counterpartAccountId: null,
        recurring: null,
      },
    } as const;
    expect(buildCommit(loaded, choices, null, null).problem).toBe("Escolha a conta do arquivo.");
    expect(buildCommit(loaded, choices, 1, null).problem).toMatch(/transferências/);

    const fixed = { ...choices, 1: { ...choices[1], counterpartAccountId: 3 } };
    expect(buildCommit(loaded, fixed, 1, null).input).toEqual({
      previewId: 7,
      accountId: 1,
      statementDate: null,
      lines: [
        {
          index: 0,
          kind: "expense",
          categoryId: null,
          counterpartAccountId: null,
          recurring: null,
        },
        { index: 1, kind: "transfer", categoryId: null, counterpartAccountId: 3, recurring: null },
      ],
    });

    const card = preview([line({ index: 0 })], "c6_card_csv");
    expect(buildCommit(card, initialChoices(card), 2, null).problem).toMatch(/vencimento/);
    expect(buildCommit(card, initialChoices(card), 2, "2026-09-05").input?.statementDate).toBe(
      "2026-09-05",
    );
  });

  it("aplica a categoria às linhas parecidas ainda sem categoria", () => {
    const income = { ...line({}).suggestion, kind: "income" } as const;
    const loaded = preview([
      line({ index: 0, sourceCategory: "Restaurante", descriptionKey: "desc:lanchonete a" }),
      line({ index: 1, sourceCategory: "Restaurante", descriptionKey: "desc:lanchonete b" }),
      line({ index: 2, descriptionKey: "desc:lanchonete a" }),
      line({ index: 3, sourceCategory: "Restaurante", duplicate: true }),
      line({ index: 4, sourceCategory: "Elétrico" }),
      line({ index: 5, sourceCategory: "Restaurante", inflow: true, suggestion: income }),
    ]);
    const withChoice = {
      ...initialChoices(loaded),
      1: {
        include: true,
        kind: "expense",
        categoryId: 9,
        counterpartAccountId: null,
        recurring: null,
      },
    } as const;

    const { choices, alsoApplied } = applyCategory(loaded, withChoice, 0, 2);
    expect(alsoApplied).toBe(1);
    expect(choices[0]?.categoryId).toBe(2);
    // Mesma descrição: recebe. Já escolhida, duplicada, outra categoria do banco
    // ou outro tipo (estorno): não mudam.
    expect(choices[2]?.categoryId).toBe(2);
    expect(choices[1]?.categoryId).toBe(9);
    expect(choices[4]?.categoryId).toBeNull();
    expect(choices[5]?.categoryId).toBeNull();

    expect(applyCategory(loaded, choices, 0, null).alsoApplied).toBe(0);
  });
});
