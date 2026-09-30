import { describe, expect, it } from "vitest";

import { describeStatementDays, parseStatementDays } from "@/features/finance/domain/cards";
import {
  commitmentTotal,
  endingDescriptions,
  installmentLabel,
  monthsUntil,
  paidFraction,
  relativeMonths,
  reliefFromPrevious,
} from "@/features/finance/domain/installments";
import { type CommitmentMonth, type InstallmentPurchase } from "@/features/finance/types";

const month = (value: string, installments: number, recurring = 0): CommitmentMonth => ({
  month: value,
  installments,
  parcels: 1,
  recurring,
  ending: [],
});

describe("dias da fatura", () => {
  it("aceita os dois dias ou nenhum", () => {
    expect(parseStatementDays("28", " 5 ")).toEqual({ closingDay: 28, dueDay: 5, error: null });
    expect(parseStatementDays("", "")).toEqual({ closingDay: null, dueDay: null, error: null });
    expect(parseStatementDays("28", "").error).toMatch(/os dois vazios/);
    expect(parseStatementDays("0", "5").error).toMatch(/1 a 31/);
    expect(parseStatementDays("32", "5").error).toMatch(/1 a 31/);
    expect(parseStatementDays("2,5", "5").error).toMatch(/1 a 31/);
    expect(describeStatementDays({ closingDay: 28, dueDay: 5 })).toBe("fecha dia 28, vence dia 5");
    expect(describeStatementDays({ closingDay: null, dueDay: null })).toBeNull();
  });
});

describe("parcelamentos", () => {
  const purchase = (partial: Partial<InstallmentPurchase>) =>
    ({
      id: "a",
      description: "Geladeira",
      count: 10,
      paid: 3,
      current: 4,
      ...partial,
    }) as InstallmentPurchase;

  it("rotula a parcela e o progresso", () => {
    expect(installmentLabel(purchase({}))).toBe("4/10");
    expect(installmentLabel(purchase({ current: null, paid: 10 }))).toBe("10/10");
    expect(paidFraction(purchase({}))).toBeCloseTo(0.3);
    expect(paidFraction(purchase({ count: 0, paid: 0 }))).toBe(0);
  });

  it("conta os meses até o fim", () => {
    expect(monthsUntil("2027-04", "2026-09-29")).toBe(7);
    expect(monthsUntil("2026-09", "2026-09-29")).toBe(0);
    expect(relativeMonths(0)).toBe("neste mês");
    expect(relativeMonths(1)).toBe("no mês que vem");
    expect(relativeMonths(7)).toBe("em 7 meses");
  });

  it("soma o mês, diz quanto alivia e o que encerra", () => {
    const months = [month("2027-03", 30_000, 5_590), month("2027-04", 30_000), month("2027-05", 0)];
    expect(commitmentTotal(months[0] as CommitmentMonth)).toBe(35_590);
    expect(reliefFromPrevious(months, 0)).toBeNull();
    expect(reliefFromPrevious(months, 1)).toBe(5_590);
    expect(reliefFromPrevious(months, 2)).toBe(30_000);
    expect(
      endingDescriptions({ ending: ["b"] }, [
        purchase({ id: "a" }),
        purchase({ id: "b", description: "Curso" }),
      ]),
    ).toEqual(["Curso"]);
  });
});
