import { vi } from "vitest";

import { balanceEffect } from "@/features/finance/domain/cashflow";
import { monthOf, shiftMonth } from "@/features/finance/domain/period";
import {
  type AccountInput,
  type CategoryInput,
  type CategoryTotal,
  type CategoryUpdate,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceOverview,
  type ImportCommitInput,
  type ImportPreview,
  type ImportResult,
  type InstallmentsOverview,
  type OccurrenceStatus,
  type RecurringInput,
  type RecurringOccurrence,
  type RecurringOverview,
  type RecurringSeries,
  type Transaction,
  type TransactionInput,
  type TransactionStatus,
} from "@/features/finance/types";
import { mockDesktopRuntime } from "@/test/tauri";

const NOW = "2026-09-28T12:00:00Z";

/** Categorias iniciais, como as criadas pela migration (subconjunto). */
export const DEFAULT_FINANCE_CATEGORIES: FinanceCategory[] = [
  { id: 1, kind: "expense", name: "Moradia", color: "blue", transactionCount: 0 },
  { id: 2, kind: "expense", name: "Alimentação", color: "orange", transactionCount: 0 },
  { id: 3, kind: "expense", name: "Lazer", color: "pink", transactionCount: 0 },
  { id: 11, kind: "income", name: "Salário", color: "green", transactionCount: 0 },
];

type StoredAccount = Omit<FinanceAccount, "balance" | "transactionCount">;

/** O Tauri rejeita com o AppError serializado (objeto puro). */
function fail(kind: string, message: string): never {
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  throw { kind, message };
}

/**
 * Backend de finanças em memória para testes de interface, com a mesma
 * semântica básica do Rust (saldo só com pagos, conta com lançamentos não
 * pode ser excluída, excluir categoria deixa o lançamento sem categoria).
 */
export function mockFinanceBackend(
  seed: {
    accounts?: Partial<StoredAccount>[];
    transactions?: Partial<Transaction>[];
    categories?: FinanceCategory[];
    /** Prévia devolvida por `preview_finance_import` (o nome do arquivo vem da chamada). */
    importPreview?: ImportPreview;
    /**
     * Recorrentes e vencimentos já calculados (o cálculo de verdade é do Rust).
     * `list_recurring` devolve os vencimentos do intervalo pedido e, em
     * `overdue`, os atrasados de antes dele.
     */
    recurring?: {
      series?: Partial<RecurringSeries>[];
      occurrences?: (Partial<RecurringOccurrence> & Pick<RecurringOccurrence, "occurrenceDate">)[];
    };
    /** Visão devolvida por `get_installments_overview` (o cálculo de verdade é do Rust). */
    installments?: Partial<InstallmentsOverview>;
  } = {},
) {
  let accounts: StoredAccount[] = (seed.accounts ?? []).map((partial, index) => ({
    id: index + 1,
    name: `Conta ${index + 1}`,
    kind: "checking",
    color: "slate",
    openingBalance: 0,
    closingDay: null,
    dueDay: null,
    ...partial,
  }));
  let categories = [...(seed.categories ?? DEFAULT_FINANCE_CATEGORIES)];
  let nextTransactionId = 1;
  let transactions: Transaction[] = (seed.transactions ?? []).map((partial) => {
    const id = partial.id ?? nextTransactionId;
    nextTransactionId = Math.max(nextTransactionId, id + 1);
    return {
      id,
      accountId: 1,
      transferAccountId: null,
      categoryId: null,
      kind: "expense",
      description: `Lançamento ${id}`,
      amount: 1_000,
      date: "2026-09-10",
      status: "paid",
      notes: "",
      tags: [],
      purchaseDate: null,
      installment: null,
      imported: false,
      recurringId: null,
      createdAt: NOW,
      updatedAt: NOW,
      ...partial,
    };
  });

  const seriesDefaults = (id: number): RecurringSeries => ({
    id,
    kind: "expense",
    description: `Recorrente ${id}`,
    amount: 10_000,
    accountId: 1,
    transferAccountId: null,
    categoryId: null,
    startDate: "2026-09-05",
    recurrence: { frequency: "monthly", interval: 1, until: null, count: null },
    notes: "",
    onCard: false,
    nextDate: null,
    lastDate: null,
    ended: false,
    endsSoon: false,
    overdueCount: 0,
    lastResolvedDate: null,
    monthlyAmount: 10_000,
    createdAt: NOW,
    updatedAt: NOW,
  });
  let series: RecurringSeries[] = (seed.recurring?.series ?? []).map((partial, index) => {
    const base = { ...seriesDefaults(partial.id ?? index + 1), ...partial };
    return { ...base, monthlyAmount: partial.monthlyAmount ?? base.amount };
  });
  let occurrences: RecurringOccurrence[] = (seed.recurring?.occurrences ?? []).map((partial) => {
    const owner = series.find((item) => item.id === (partial.recurringId ?? 1));
    return {
      recurringId: 1,
      status: "open",
      amount: owner?.amount ?? 10_000,
      transactionId: null,
      transactionDate: null,
      statementDate: null,
      ...partial,
    };
  });

  const findOccurrence = (id: number, occurrenceDate: string) =>
    occurrences.find(
      (occurrence) => occurrence.recurringId === id && occurrence.occurrenceDate === occurrenceDate,
    ) ?? fail("not_found", "vencimento não encontrado");

  const setOccurrence = (
    id: number,
    occurrenceDate: string,
    change: Partial<RecurringOccurrence>,
  ) => {
    findOccurrence(id, occurrenceDate);
    occurrences = occurrences.map((occurrence) =>
      occurrence.recurringId === id && occurrence.occurrenceDate === occurrenceDate
        ? { ...occurrence, ...change }
        : occurrence,
    );
  };

  const settledStatus = (transaction: Transaction): OccurrenceStatus =>
    transaction.status === "paid" ? "paid" : "pending";

  const fromRecurringInput = (id: number, input: RecurringInput): RecurringSeries => ({
    ...seriesDefaults(id),
    ...input,
    nextDate: input.startDate,
    monthlyAmount: input.amount,
  });

  const withBalances = (): FinanceAccount[] =>
    [...accounts]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((account) => {
        const own = transactions.filter(
          (transaction) =>
            transaction.accountId === account.id || transaction.transferAccountId === account.id,
        );
        return {
          ...account,
          balance:
            account.openingBalance +
            own
              .filter((transaction) => transaction.status === "paid")
              .reduce((sum, transaction) => sum + balanceEffect(transaction, account.id), 0),
          transactionCount: own.length,
        };
      });

  const withCounts = (): FinanceCategory[] =>
    categories.map((category) => ({
      ...category,
      transactionCount: transactions.filter((transaction) => transaction.categoryId === category.id)
        .length,
    }));

  const findTransaction = (id: number) =>
    transactions.find((transaction) => transaction.id === id) ??
    fail("not_found", "lançamento não encontrado");

  const fromInput = (input: TransactionInput) => ({
    ...input,
    tags: [...new Set(input.tags.map((tag) => tag.toLowerCase()))].sort(),
  });

  const sortDesc = (list: Transaction[]) =>
    [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  const handlers = {
    list_finance_accounts: vi.fn(withBalances),
    create_finance_account: vi.fn(({ input }: { input: AccountInput }) => {
      const id = Math.max(0, ...accounts.map((account) => account.id)) + 1;
      accounts = [...accounts, { id, ...input }];
      return withBalances().find((account) => account.id === id) as FinanceAccount;
    }),
    update_finance_account: vi.fn(({ id, input }: { id: number; input: AccountInput }) => {
      accounts = accounts.map((account) => (account.id === id ? { id, ...input } : account));
      return (
        withBalances().find((account) => account.id === id) ??
        fail("not_found", "conta não encontrada")
      );
    }),
    delete_finance_account: vi.fn(({ id }: { id: number }) => {
      if (transactions.some((transaction) => transaction.accountId === id)) {
        fail("validation", "a conta tem lançamentos; exclua-os ou mude-os de conta antes");
      }
      accounts = accounts.filter((account) => account.id !== id);
      return null;
    }),
    list_finance_categories: vi.fn(withCounts),
    create_finance_category: vi.fn(({ input }: { input: CategoryInput }) => {
      const category: FinanceCategory = {
        id: Math.max(0, ...categories.map((current) => current.id)) + 1,
        ...input,
        transactionCount: 0,
      };
      categories = [...categories, category];
      return category;
    }),
    update_finance_category: vi.fn(({ id, input }: { id: number; input: CategoryUpdate }) => {
      categories = categories.map((category) =>
        category.id === id ? { ...category, ...input } : category,
      );
      return (
        withCounts().find((category) => category.id === id) ??
        fail("not_found", "categoria não encontrada")
      );
    }),
    delete_finance_category: vi.fn(({ id }: { id: number }) => {
      categories = categories.filter((category) => category.id !== id);
      transactions = transactions.map((transaction) =>
        transaction.categoryId === id ? { ...transaction, categoryId: null } : transaction,
      );
      return null;
    }),
    list_transactions: vi.fn(({ from, to }: { from: string; to: string }) =>
      sortDesc(
        transactions.filter((transaction) => transaction.date >= from && transaction.date <= to),
      ),
    ),
    list_transaction_tags: vi.fn(() =>
      [...new Set(transactions.flatMap((transaction) => transaction.tags))].sort(),
    ),
    create_transaction: vi.fn(({ input }: { input: TransactionInput }) => {
      const transaction: Transaction = {
        id: nextTransactionId++,
        ...fromInput(input),
        purchaseDate: null,
        installment: null,
        imported: false,
        recurringId: null,
        createdAt: NOW,
        updatedAt: NOW,
      };
      transactions = [...transactions, transaction];
      return transaction;
    }),
    update_transaction: vi.fn(({ id, input }: { id: number; input: TransactionInput }) => {
      findTransaction(id);
      transactions = transactions.map((transaction) =>
        transaction.id === id ? { ...transaction, ...fromInput(input) } : transaction,
      );
      return findTransaction(id);
    }),
    set_transaction_status: vi.fn(({ id, status }: { id: number; status: TransactionStatus }) => {
      findTransaction(id);
      transactions = transactions.map((transaction) =>
        transaction.id === id ? { ...transaction, status } : transaction,
      );
      occurrences = occurrences.map((occurrence) =>
        occurrence.transactionId === id
          ? { ...occurrence, status: status === "paid" ? "paid" : "pending" }
          : occurrence,
      );
      return findTransaction(id);
    }),
    delete_transaction: vi.fn(({ id }: { id: number }) => {
      findTransaction(id);
      transactions = transactions.filter((transaction) => transaction.id !== id);
      return null;
    }),
    preview_finance_import: vi.fn(({ fileName }: { fileName: string; content: string }) => {
      if (!seed.importPreview) fail("validation", "formato não reconhecido");
      return { ...seed.importPreview, fileName };
    }),
    commit_finance_import: vi.fn(({ input }: { input: ImportCommitInput }): ImportResult => {
      const preview = seed.importPreview ?? fail("not_found", "prévia expirada");
      const card = preview.format === "c6_card_csv";
      for (const decision of input.lines) {
        const line = preview.lines[decision.index] ?? fail("validation", "linha inexistente");
        const transfer = decision.kind === "transfer";
        const other = decision.counterpartAccountId;
        transactions = [
          ...transactions,
          {
            id: nextTransactionId++,
            accountId: transfer && line.inflow && other !== null ? other : input.accountId,
            transferAccountId: transfer ? (line.inflow ? input.accountId : other) : null,
            categoryId: transfer ? null : decision.categoryId,
            kind: decision.kind,
            description: line.description,
            amount: line.amount,
            date: card ? (input.statementDate ?? line.date) : line.date,
            status: "paid",
            notes: "",
            tags: [],
            purchaseDate: card ? line.date : null,
            installment: line.installment,
            imported: true,
            recurringId: decision.recurring?.recurringId ?? null,
            createdAt: NOW,
            updatedAt: NOW,
          },
        ];
      }
      return {
        added: input.lines.length,
        duplicates: 0,
        skipped: preview.lines.length - input.lines.length,
        linked: input.lines.filter((line) => line.recurring !== null).length,
      };
    }),
    get_installments_overview: vi.fn((): InstallmentsOverview => ({
      today: NOW.slice(0, 10),
      purchases: [],
      months: [],
      summary: { activePurchases: 0, remainingParcels: 0, remainingAmount: 0, currentMonth: 0 },
      finalMonth: null,
      cardsWithoutCycle: [],
      ...seed.installments,
    })),
    list_recurring: vi.fn(({ from, to }: { from: string; to: string }): RecurringOverview => {
      const inRange = occurrences.filter(
        (occurrence) => occurrence.occurrenceDate >= from && occurrence.occurrenceDate <= to,
      );
      const kindOf = (occurrence: RecurringOccurrence) =>
        series.find((item) => item.id === occurrence.recurringId)?.kind;
      const sum = (kind: string, paidOnly: boolean) =>
        inRange
          .filter(
            (occurrence) =>
              kindOf(occurrence) === kind &&
              occurrence.status !== "skipped" &&
              (!paidOnly || occurrence.status === "paid"),
          )
          .reduce((total, occurrence) => total + occurrence.amount, 0);
      const overdue = occurrences.filter((occurrence) => occurrence.status === "overdue");
      const active = series.filter((item) => !item.ended);
      return {
        today: NOW.slice(0, 10),
        series,
        occurrences: inRange,
        overdue: overdue.filter((occurrence) => occurrence.occurrenceDate < from),
        totals: {
          expenses: sum("expense", false),
          expensesRealized: sum("expense", true),
          income: sum("income", false),
          incomeRealized: sum("income", true),
        },
        summary: {
          monthlyExpenses: active
            .filter((item) => item.kind === "expense")
            .reduce((total, item) => total + item.monthlyAmount, 0),
          monthlyCardExpenses: active
            .filter((item) => item.kind === "expense" && item.onCard)
            .reduce((total, item) => total + item.monthlyAmount, 0),
          monthlyIncome: active
            .filter((item) => item.kind === "income")
            .reduce((total, item) => total + item.monthlyAmount, 0),
          overdueCount: overdue.length,
          overdueExpenses: overdue
            .filter((occurrence) => kindOf(occurrence) === "expense")
            .reduce((total, occurrence) => total + occurrence.amount, 0),
          overdueIncome: overdue
            .filter((occurrence) => kindOf(occurrence) === "income")
            .reduce((total, occurrence) => total + occurrence.amount, 0),
        },
      };
    }),
    create_recurring: vi.fn(({ input }: { input: RecurringInput }) => {
      const created = fromRecurringInput(Math.max(0, ...series.map((item) => item.id)) + 1, input);
      series = [...series, created];
      occurrences = [
        ...occurrences,
        {
          recurringId: created.id,
          occurrenceDate: input.startDate,
          status: "open",
          amount: input.amount,
          transactionId: null,
          transactionDate: null,
          statementDate: null,
        },
      ];
      return created;
    }),
    update_recurring: vi.fn(({ id, input }: { id: number; input: RecurringInput }) => {
      const current =
        series.find((item) => item.id === id) ?? fail("not_found", "recorrente não encontrada");
      const updated = { ...current, ...fromRecurringInput(id, input) };
      series = series.map((item) => (item.id === id ? updated : item));
      return updated;
    }),
    delete_recurring: vi.fn(({ id }: { id: number }) => {
      if (!series.some((item) => item.id === id)) fail("not_found", "recorrente não encontrada");
      series = series.filter((item) => item.id !== id);
      occurrences = occurrences.filter((occurrence) => occurrence.recurringId !== id);
      transactions = transactions.map((transaction) =>
        transaction.recurringId === id ? { ...transaction, recurringId: null } : transaction,
      );
      return null;
    }),
    register_recurring_occurrence: vi.fn(
      ({
        id,
        occurrenceDate,
        input,
      }: {
        id: number;
        occurrenceDate: string;
        input: TransactionInput;
      }) => {
        findOccurrence(id, occurrenceDate);
        const transaction: Transaction = {
          id: nextTransactionId++,
          ...fromInput(input),
          purchaseDate: null,
          installment: null,
          imported: false,
          recurringId: id,
          createdAt: NOW,
          updatedAt: NOW,
        };
        transactions = [...transactions, transaction];
        setOccurrence(id, occurrenceDate, {
          status: settledStatus(transaction),
          amount: transaction.amount,
          transactionId: transaction.id,
          transactionDate: transaction.date,
        });
        return transaction;
      },
    ),
    link_recurring_occurrence: vi.fn(
      ({
        id,
        occurrenceDate,
        transactionId,
      }: {
        id: number;
        occurrenceDate: string;
        transactionId: number;
      }) => {
        const transaction = findTransaction(transactionId);
        transactions = transactions.map((item) =>
          item.id === transactionId ? { ...item, recurringId: id } : item,
        );
        setOccurrence(id, occurrenceDate, {
          status: settledStatus(transaction),
          amount: transaction.amount,
          transactionId,
          transactionDate: transaction.date,
        });
        return null;
      },
    ),
    skip_recurring_occurrence: vi.fn(
      ({ id, occurrenceDate }: { id: number; occurrenceDate: string }) => {
        setOccurrence(id, occurrenceDate, { status: "skipped" });
        return null;
      },
    ),
    reopen_recurring_occurrence: vi.fn(
      ({ id, occurrenceDate }: { id: number; occurrenceDate: string }) => {
        const occurrence = findOccurrence(id, occurrenceDate);
        transactions = transactions.map((transaction) =>
          transaction.id === occurrence.transactionId
            ? { ...transaction, recurringId: null }
            : transaction,
        );
        const owner = series.find((item) => item.id === id);
        setOccurrence(id, occurrenceDate, {
          status: "open",
          amount: owner?.amount ?? occurrence.amount,
          transactionId: null,
          transactionDate: null,
        });
        return null;
      },
    ),
    get_finance_overview: vi.fn(({ month }: { month: string }): FinanceOverview => {
      const inMonth = (target: string) =>
        transactions.filter((transaction) => monthOf(transaction.date) === target);
      const sum = (list: Transaction[], kind: Transaction["kind"], pendingOnly = false) =>
        list
          .filter(
            (transaction) =>
              transaction.kind === kind && (!pendingOnly || transaction.status === "pending"),
          )
          .reduce((total, transaction) => total + transaction.amount, 0);
      const current = inMonth(month);
      const byCategory = new Map<number | null, number>();
      for (const transaction of current.filter((item) => item.kind === "expense")) {
        byCategory.set(
          transaction.categoryId,
          (byCategory.get(transaction.categoryId) ?? 0) + transaction.amount,
        );
      }
      const expensesByCategory: CategoryTotal[] = [...byCategory]
        .map(([categoryId, total]) => ({ categoryId, total }))
        .sort((a, b) => b.total - a.total);
      return {
        month,
        totals: {
          income: sum(current, "income"),
          incomePending: sum(current, "income", true),
          expenses: sum(current, "expense"),
          expensesPending: sum(current, "expense", true),
        },
        history: [5, 4, 3, 2, 1, 0].map((back) => {
          const target = shiftMonth(month, -back);
          return {
            month: target,
            income: sum(inMonth(target), "income"),
            expenses: sum(inMonth(target), "expense"),
          };
        }),
        expensesByCategory,
      };
    }),
  };

  mockDesktopRuntime(handlers);
  return {
    handlers,
    transactions: () => transactions,
    accounts: () => accounts,
    occurrences: () => occurrences,
  };
}
