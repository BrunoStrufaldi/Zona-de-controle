import { describe, expect, it } from "vitest";

import { summarizeCashflow } from "@/features/finance/domain/cashflow";
import {
  describeBattery,
  deviceSubtitle,
  markingKindOptions,
} from "@/features/system/devices/domain/battery";
import { usageHealth } from "@/features/system/domain/health";

describe("finanças", () => {
  it("resume receita, despesas, saldo e economia", () => {
    expect(summarizeCashflow(10_000, 7_500)).toEqual({
      income: 10_000,
      expenses: 7_500,
      net: 2_500,
      savingsRate: 0.25,
    });
  });

  it("economia é negativa com déficit e zero sem receita", () => {
    expect(summarizeCashflow(1_000, 1_500).savingsRate).toBe(-0.5);
    expect(summarizeCashflow(0, 300).savingsRate).toBe(0);
  });
});

describe("sistema", () => {
  it("classifica o uso de recursos", () => {
    expect(usageHealth(50, 100)).toBe("healthy");
    expect(usageHealth(85, 100)).toBe("attention");
    expect(usageHealth(95, 100)).toBe("critical");
  });
});

describe("bateria", () => {
  it("nunca inventa valor para dispositivos sem suporte", () => {
    expect(
      describeBattery({ support: "unsupported", level: { kind: "exact", percent: 50 } }),
    ).toEqual({ label: "Não disponível", percent: null, tone: "muted", unavailable: true });
    expect(
      describeBattery({ support: "supported", level: { kind: "unknown" } }).percent,
    ).toBeNull();
  });

  it("exibe percentual exato e faixas aproximadas", () => {
    expect(
      describeBattery({ support: "supported", level: { kind: "exact", percent: 15 } }),
    ).toEqual({ label: "15%", percent: 15, tone: "danger", unavailable: false });
    expect(
      describeBattery({ support: "partial", level: { kind: "approximate", bucket: "medium" } })
        .label,
    ).toBe("Média (aprox.)");
  });

  it("controle com fio não tem bateria nem é tratado como leitura faltando", () => {
    expect(describeBattery({ support: "supported", level: { kind: "wired" } })).toEqual({
      label: "Com fio",
      percent: null,
      tone: "muted",
      unavailable: false,
    });
  });

  it("descreve a conexão e o estado de carga quando conhecido", () => {
    expect(deviceSubtitle({ connection: "proprietary24Ghz", charging: "unknown" })).toBe(
      "2.4 GHz · receptor USB conectado",
    );
    expect(deviceSubtitle({ connection: "bluetooth", charging: "charging" })).toBe(
      "Bluetooth · Carregando",
    );
    expect(deviceSubtitle({ connection: "wireless", charging: "unknown" })).toBe("Sem fio");
  });

  it("oferece o tipo sugerido primeiro ao marcar", () => {
    expect(markingKindOptions("headset")).toEqual(["headset", "mouse", "keyboard", "other"]);
    expect(markingKindOptions("controller")).toEqual([
      "controller",
      "mouse",
      "keyboard",
      "headset",
      "other",
    ]);
  });
});
