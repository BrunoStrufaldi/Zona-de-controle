import { describe, expect, it } from "vitest";

import {
  cancelBlocked,
  describeResult,
  resultIsProblem,
} from "@/features/system/windows-repair/domain/repair";
import { scanningProgress, sfcProgress } from "@/test/fake-windows-repair-backend";

describe("textos do reparo", () => {
  it("falhas da DISM explicam o que fazer e mostram o código", () => {
    expect(
      describeResult({
        status: "failed",
        code: 0x800f082f,
        kind: "rebootPending",
        detail: "x",
      }),
    ).toBe("Há um reinício pendente. Reinicie o computador e rode o reparo de novo. (0x800F082F)");
    expect(describeResult({ status: "failed", code: null, kind: "other", detail: "x" })).toBe(
      "A operação falhou.",
    );
  });

  it("resultado do SFC desconhecido nunca vira palpite", () => {
    expect(describeResult({ status: "sfc", outcome: "unknown" })).toContain(
      "não pôde ser identificado",
    );
  });

  it("o que pede atenção", () => {
    expect(resultIsProblem({ status: "health", health: "nonRepairable" })).toBe(true);
    expect(resultIsProblem({ status: "sfc", outcome: "couldNotRepair" })).toBe(true);
    expect(resultIsProblem({ status: "health", health: "repairable" })).toBe(false);
    expect(resultIsProblem({ status: "skipped" })).toBe(false);
  });

  it("o cancelamento fica bloqueado só durante o SFC", () => {
    expect(cancelBlocked(scanningProgress())).toBe(false);
    expect(cancelBlocked(sfcProgress())).toBe(true);
  });
});
