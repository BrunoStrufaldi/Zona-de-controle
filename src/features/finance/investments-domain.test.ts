import { describe, expect, it } from "vitest";

import {
  emptyAssetDraft,
  emptyMovementDraft,
  formatGain,
  formatGainWithRate,
  predatesValuation,
  formatQuantity,
  groupByClass,
  parseQuantity,
  QUANTITY_SCALE,
  toMovementDraft,
  toQuantityInput,
  validateAssetDraft,
  validateMovementDraft,
  validateValuations,
  valueStatusText,
} from "@/features/finance/domain/investments";
import { type InvestmentAsset, type Position } from "@/features/finance/types";

function position(partial: Partial<Position> = {}): Position {
  return {
    value: 100_000,
    valueStatus: "informed",
    valuedOn: "2026-09-15",
    contributed: 100_000,
    withdrawn: 0,
    income: 0,
    invested: 100_000,
    gain: 0,
    gainRate: 0,
    quantity: null,
    averagePrice: null,
    stale: false,
    closed: false,
    movementCount: 1,
    ...partial,
  };
}

function asset(partial: Partial<InvestmentAsset>): InvestmentAsset {
  return {
    id: 1,
    accountId: 2,
    class: "fixed_income",
    name: "CDB",
    ticker: null,
    maturityDate: null,
    notes: "",
    position: position(),
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("quantidade", () => {
  it("aceita frações com vírgula ou ponto, até 8 casas", () => {
    expect(parseQuantity("10")).toBe(10 * QUANTITY_SCALE);
    expect(parseQuantity(" 0,5 ")).toBe(QUANTITY_SCALE / 2);
    expect(parseQuantity("0.00012345")).toBe(12_345);
    expect(parseQuantity("1.234,5")).toBe(1_234.5 * QUANTITY_SCALE);
    expect(parseQuantity("1.234")).toBe(1_234 * QUANTITY_SCALE);
    expect(parseQuantity("0,000000001")).toBeNull();
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("-1")).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
    expect(parseQuantity("")).toBeNull();
  });

  it("exibe e volta para o campo sem perder casas", () => {
    expect(formatQuantity(150 * QUANTITY_SCALE)).toBe("150");
    expect(formatQuantity(12_345)).toBe("0,00012345");
    expect(toQuantityInput(1.5 * QUANTITY_SCALE)).toBe("1,5");
    expect(toQuantityInput(12_345)).toBe("0,00012345");
    expect(toQuantityInput(3 * QUANTITY_SCALE)).toBe("3");
  });
});

describe("posição", () => {
  it("explica de onde vem o valor", () => {
    expect(valueStatusText(position())).toBe("Informado em 15/09/2026");
    expect(valueStatusText(position({ valueStatus: "adjusted" }))).toBe(
      "Informado em 15/09/2026 + movimentações depois",
    );
    expect(valueStatusText(position({ valueStatus: "not_informed", valuedOn: null }))).toMatch(
      /não informado/,
    );
  });

  it("mostra o resultado com sinal e percentual", () => {
    expect(formatGain(90_000)).toMatch(/^\+R\$\s900,00$/);
    expect(formatGain(-5_000)).toMatch(/^−R\$\s50,00$/);
    expect(formatGain(0)).toMatch(/^R\$\s0,00$/);
    expect(formatGainWithRate({ gain: 900, gainRate: 0.009 })).toMatch(/^\+R\$\s9,00 \(\+0,9%\)$/);
    expect(formatGainWithRate({ gain: -5_000, gainRate: -0.05 })).toMatch(/^−R\$\s50,00 \(−5%\)$/);
    expect(formatGainWithRate({ gain: 0, gainRate: null })).toMatch(/^R\$\s0,00$/);
  });

  it("avisa quando a movimentação é de antes do último valor informado", () => {
    expect(predatesValuation({ valuedOn: "2026-09-29" }, "2026-09-20")).toBe(true);
    expect(predatesValuation({ valuedOn: "2026-09-29" }, "2026-09-29")).toBe(true);
    expect(predatesValuation({ valuedOn: "2026-09-29" }, "2026-09-30")).toBe(false);
    expect(predatesValuation({ valuedOn: null }, "2026-09-20")).toBe(false);
  });

  it("agrupa os ativos em aberto por classe", () => {
    const groups = groupByClass([
      asset({ id: 1, class: "stocks", name: "ITSA4" }),
      asset({ id: 2, name: "CDB" }),
      asset({ id: 3, name: "Antigo", position: position({ value: 0, closed: true }) }),
    ]);
    expect(groups.map((group) => [group.assetClass, group.assets.map((a) => a.name)])).toEqual([
      ["fixed_income", ["CDB"]],
      ["stocks", ["ITSA4"]],
    ]);
  });
});

describe("formulários", () => {
  it("valida o ativo e só guarda vencimento na renda fixa", () => {
    const draft = {
      ...emptyAssetDraft(2),
      name: "  CDB   C6 ",
      ticker: " ",
      maturityDate: "2028-01-03",
    };
    expect(validateAssetDraft(draft).input).toEqual({
      accountId: 2,
      class: "fixed_income",
      name: "CDB C6",
      ticker: null,
      maturityDate: "2028-01-03",
      notes: "",
    });
    const stock = validateAssetDraft({ ...draft, class: "stocks", ticker: "itsa4" }).input;
    expect(stock?.ticker).toBe("ITSA4");
    expect(stock?.maturityDate).toBeNull();

    const invalid = validateAssetDraft({ ...emptyAssetDraft(null), ticker: "IT SA4" });
    expect(invalid.input).toBeNull();
    expect(Object.keys(invalid.errors).sort()).toEqual(["accountId", "name", "ticker"]);
  });

  it("valida a movimentação", () => {
    const draft = {
      ...emptyMovementDraft("contribution", "2026-09-30", 1),
      amountText: "1.000,00",
      quantityText: "10",
      closesPosition: true,
    };
    expect(validateMovementDraft(draft).input).toEqual({
      kind: "contribution",
      date: "2026-09-30",
      amount: 100_000,
      quantity: 10 * QUANTITY_SCALE,
      notes: "",
      accountId: 1,
      // Só o resgate encerra a posição.
      closesPosition: false,
    });
    // Provento não tem quantidade.
    expect(validateMovementDraft({ ...draft, kind: "income" }).input?.quantity).toBeNull();
    expect(validateMovementDraft({ ...draft, kind: "withdrawal" }).input?.closesPosition).toBe(
      true,
    );
    const invalid = validateMovementDraft({ ...draft, amountText: "0", quantityText: "x" });
    expect(invalid.input).toBeNull();
    expect(Object.keys(invalid.errors).sort()).toEqual(["amountText", "quantityText"]);
  });

  it("edita a movimentação sem gerar lançamento", () => {
    const draft = toMovementDraft({
      id: 1,
      assetId: 1,
      kind: "withdrawal",
      date: "2026-09-10",
      amount: 123_456,
      quantity: QUANTITY_SCALE / 4,
      transactionId: 9,
      notes: "",
    });
    expect(draft).toMatchObject({ amountText: "1234,56", quantityText: "0,25", accountId: null });
  });

  it("manda só os valores preenchidos", () => {
    const { inputs, errors } = validateValuations(
      [
        { assetId: 1, valueText: "1.050,00" },
        { assetId: 2, valueText: "" },
        { assetId: 3, valueText: "abc" },
        { assetId: 4, valueText: "0" },
      ],
      "2026-09-30",
    );
    expect(inputs).toEqual([
      { assetId: 1, date: "2026-09-30", value: 105_000 },
      { assetId: 4, date: "2026-09-30", value: 0 },
    ]);
    expect([...errors.keys()]).toEqual([3]);
  });
});
