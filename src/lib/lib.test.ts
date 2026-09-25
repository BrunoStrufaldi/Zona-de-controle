import { describe, expect, it } from "vitest";

import { navigation } from "@/config/navigation";
import { auditTargetLabel } from "@/lib/audit";
import { addDays, daysBetween, toIsoDate } from "@/lib/dates";
import {
  formatBytes,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDuration,
  formatPercent,
} from "@/lib/format";
import { getGreeting } from "@/lib/greeting";
import { safeRatio } from "@/lib/math";
import { findNavigationTrail, flattenNavigation } from "@/lib/navigation";

describe("format", () => {
  it("formata moeda em BRL", () => {
    // Intl usa espaço não separável entre "R$" e o valor.
    expect(formatCurrency(1234.56)).toMatch(/^R\$\s1\.234,56$/);
    expect(formatCurrency(-89.9)).toMatch(/^-R\$\s89,90$/);
  });

  it("formata datas como dd/mm/aaaa sem deslocamento de fuso", () => {
    expect(formatDate("2026-09-25")).toBe("25/09/2026");
    expect(formatDate(new Date(2026, 0, 5))).toBe("05/01/2026");
    expect(formatDate("data inválida")).toBe("—");
    expect(formatDateTime(new Date(2026, 8, 25, 14, 30))).toBe("25/09/2026 14:30");
  });

  it("formata percentuais, bytes e durações", () => {
    expect(formatPercent(0.299)).toMatch(/^29,9\s?%$/);
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(0)).toBe("0 B");
    expect(formatDuration(3 * 3600 + 42 * 60)).toBe("3h 42min");
    expect(formatDuration(45 * 60)).toBe("45min");
  });
});

describe("greeting", () => {
  it.each([
    [6, "Bom dia"],
    [12, "Boa tarde"],
    [19, "Boa noite"],
    [2, "Boa noite"],
  ] as const)("às %ih retorna “%s”", (hour, expected) => {
    expect(getGreeting(new Date(2026, 8, 25, hour))).toBe(expected);
  });
});

describe("math", () => {
  it("safeRatio evita divisão por zero e limita a [0, 1]", () => {
    expect(safeRatio(5, 10)).toBe(0.5);
    expect(safeRatio(5, 0)).toBe(0);
    expect(safeRatio(20, 10)).toBe(1);
    expect(safeRatio(-1, 10)).toBe(0);
  });
});

describe("navigation", () => {
  it("gera o breadcrumb a partir da configuração", () => {
    expect(findNavigationTrail(navigation, "/")).toEqual(["Dashboard"]);
    expect(findNavigationTrail(navigation, "/finance/recurring/")).toEqual([
      "Finanças",
      "Recorrentes",
    ]);
    expect(findNavigationTrail(navigation, "/nao-existe")).toEqual([]);
  });

  it("não possui caminhos duplicados", () => {
    const allPaths = flattenNavigation(navigation).map((item) => item.path);
    expect(new Set(allPaths).size).toBe(allPaths.length);
    expect(allPaths).toHaveLength(16);
  });
});

describe("dates", () => {
  it("converte, soma e compara datas locais", () => {
    expect(toIsoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(daysBetween("2026-09-25", "2026-10-05")).toBe(10);
    expect(daysBetween("2026-09-25", "2026-09-20")).toBe(-5);
  });
});

describe("audit", () => {
  it("usa o título dos detalhes quando disponível", () => {
    expect(auditTargetLabel({ target: "1", details: { title: "Pagar conta" } })).toBe(
      "Pagar conta (#1)",
    );
    expect(auditTargetLabel({ target: "profile.display_name", details: null })).toBe(
      "profile.display_name",
    );
    expect(auditTargetLabel({ target: null, details: ["x"] })).toBe("—");
  });
});
