import { describe, expect, it } from "vitest";

import {
  describeRange,
  maturityText,
  performanceRange,
  PORTFOLIO_START,
} from "@/features/finance/domain/performance";

describe("períodos do desempenho", () => {
  it("terminam hoje", () => {
    const today = "2026-09-30";
    expect(performanceRange("month", today)).toEqual({ from: "2026-09-01", to: today });
    expect(performanceRange("year", today)).toEqual({ from: "2026-01-01", to: today });
    expect(performanceRange("12m", today)).toEqual({ from: "2025-10-01", to: today });
    expect(performanceRange("12m", "2024-02-29")).toEqual({
      from: "2023-03-01",
      to: "2024-02-29",
    });
    expect(performanceRange("all", today)).toEqual({ from: PORTFOLIO_START, to: today });
  });

  it("descreve o intervalo", () => {
    expect(describeRange({ from: "2026-09-01", to: "2026-09-30" })).toBe(
      "de 01/09/2026 a 30/09/2026",
    );
    expect(describeRange({ from: PORTFOLIO_START, to: "2026-09-30" })).toBe("desde o início");
  });

  it("diz quanto falta para o vencimento", () => {
    expect(maturityText(0)).toBe("vence hoje");
    expect(maturityText(1)).toBe("vence amanhã");
    expect(maturityText(76)).toBe("vence em 76 dias");
    expect(maturityText(-1)).toBe("venceu ontem");
    expect(maturityText(-29)).toBe("venceu há 29 dias");
  });
});
