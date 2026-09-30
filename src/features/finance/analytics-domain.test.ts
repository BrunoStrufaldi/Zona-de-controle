import { describe, expect, it } from "vitest";

import {
  analyticsSpan,
  categoryTrendRows,
  changeText,
  describeSpan,
  netWorthSummary,
  previousSpan,
  spanLength,
} from "@/features/finance/domain/analytics";
import { type AnalyticsMonth, type FinanceCategory } from "@/features/finance/types";

describe("períodos da análise", () => {
  it("terminam no mês atual, exceto o ano passado", () => {
    const today = "2026-09-30";
    expect(analyticsSpan("6m", today)).toEqual({ from: "2026-04", to: "2026-09" });
    expect(analyticsSpan("12m", today)).toEqual({ from: "2025-10", to: "2026-09" });
    expect(analyticsSpan("year", today)).toEqual({ from: "2026-01", to: "2026-09" });
    expect(analyticsSpan("last-year", today)).toEqual({ from: "2025-01", to: "2025-12" });
  });

  it("compara com o período anterior de mesmo tamanho", () => {
    const span = { from: "2025-10", to: "2026-09" };
    expect(spanLength(span)).toBe(12);
    expect(previousSpan(span)).toEqual({ from: "2024-10", to: "2025-09" });
    expect(previousSpan({ from: "2026-01", to: "2026-09" })).toEqual({
      from: "2025-04",
      to: "2025-12",
    });
    expect(describeSpan(span)).toBe("de outubro de 2025 a setembro de 2026");
    expect(describeSpan({ from: "2026-09", to: "2026-09" })).toBe("setembro de 2026");
  });
});

describe("patrimônio", () => {
  const month = (value: string, total: number | null): AnalyticsMonth => ({
    month: value,
    income: 0,
    expenses: 0,
    net: 0,
    netWorth: total === null ? null : { accounts: total, investments: 0, total },
  });

  it("usa o primeiro e o último mês conhecidos", () => {
    const summary = netWorthSummary([
      month("2026-06", null),
      month("2026-07", 100_000),
      month("2026-08", 90_000),
      month("2026-09", 130_000),
    ]);
    expect(summary?.first.month).toBe("2026-07");
    expect(summary?.last.month).toBe("2026-09");
    expect(summary?.change).toBe(30_000);
    expect(netWorthSummary([month("2026-09", null)])).toBeNull();
  });
});

describe("categorias", () => {
  it("dá nome, participação e variação", () => {
    const categories = new Map<number, FinanceCategory>([
      [1, { id: 1, kind: "expense", name: "Moradia", color: "blue", transactionCount: 3 }],
    ]);
    const rows = categoryTrendRows(
      [
        { categoryId: 1, total: 75_000, previousTotal: 50_000, months: [75_000] },
        { categoryId: null, total: 25_000, previousTotal: 0, months: [25_000] },
      ],
      categories,
    );
    expect(rows.map((row) => [row.name, row.share, row.change])).toEqual([
      ["Moradia", 0.75, 0.5],
      ["Sem categoria", 0.25, null],
    ]);
  });

  it("descreve a variação", () => {
    expect(changeText(0.5)).toBe("+50%");
    expect(changeText(-0.08)).toBe("−8%");
    expect(changeText(0.004)).toBe("igual");
    expect(changeText(null)).toBe("sem gastos antes");
  });
});
