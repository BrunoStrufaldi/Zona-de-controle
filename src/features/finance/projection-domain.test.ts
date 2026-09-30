import { describe, expect, it } from "vitest";

import {
  estimatedNet,
  installmentsReliefs,
  installmentsTotal,
  knownFlows,
  lowestBalance,
  pointName,
  pointTick,
  projectionPoints,
  TODAY_KEY,
} from "@/features/finance/domain/projection";
import { type ProjectedFlows, type ProjectionMonth } from "@/features/finance/types";

const flows = (partial: Partial<ProjectedFlows> = {}): ProjectedFlows => ({
  recurring: 0,
  installments: 0,
  scheduled: 0,
  estimated: 0,
  ...partial,
});

const month = (
  value: string,
  balance: number,
  expenses: Partial<ProjectedFlows> = {},
): ProjectionMonth => ({
  month: value,
  income: flows({ estimated: 5_000 }),
  expenses: flows(expenses),
  balanceKnown: balance + 1_000,
  balance,
});

describe("projeção", () => {
  it("separa o conhecido da estimativa", () => {
    const october = month("2026-10", 100, {
      recurring: 200_000,
      installments: 30_000,
      scheduled: 5_000,
      estimated: 60_000,
    });
    expect(knownFlows(october.expenses)).toBe(235_000);
    expect(estimatedNet(october)).toBe(-55_000);
  });

  it("começa hoje e segue pelo fim de cada mês", () => {
    const points = projectionPoints({
      today: "2026-09-20",
      startBalance: 400_000,
      months: [month("2026-09", 380_000), month("2026-10", 900_000)],
      estimate: { months: 6, income: 0, expenses: 0 },
      installmentsFinalMonth: null,
      cardsWithoutCycle: [],
      unlinkedRecurring: 0,
    });
    expect(points.map((point) => [point.key, point.balance])).toEqual([
      [TODAY_KEY, 400_000],
      ["2026-09", 380_000],
      ["2026-10", 900_000],
    ]);
    expect(pointTick(TODAY_KEY)).toBe("hoje");
    expect(pointTick("2026-10")).toBe("out");
    expect(pointName("2026-10")).toBe("fim de outubro de 2026");
  });

  it("acha o menor saldo e quando as parcelas diminuem", () => {
    const months = [
      month("2026-09", 50_000, { installments: 30_000 }),
      month("2026-10", -20_000, { installments: 30_000 }),
      month("2026-11", 10_000, { installments: 12_000 }),
      month("2026-12", 40_000),
    ];
    expect(lowestBalance(months)?.month).toBe("2026-10");
    expect(lowestBalance([])).toBeNull();
    expect(installmentsTotal(months)).toBe(72_000);
    expect(installmentsReliefs(months)).toEqual([
      { month: "2026-11", amount: 18_000 },
      { month: "2026-12", amount: 12_000 },
    ]);
  });
});
