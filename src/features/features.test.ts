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
    ).toMatchObject({ label: "Não disponível", percent: null, tone: "muted" });
    expect(
      describeBattery({ support: "supported", level: { kind: "unknown" } }).percent,
    ).toBeNull();
  });

  it("exibe percentual exato e faixas aproximadas", () => {
    expect(
      describeBattery({ support: "supported", level: { kind: "exact", percent: 15 } }),
    ).toEqual({ label: "15%", percent: 15, tone: "danger", explanation: null });
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
      explanation: null,
    });
  });

  it("aguardando leitura e desligado nunca viram número", () => {
    const waiting = describeBattery({ support: "supported", level: { kind: "waiting" } });
    expect(waiting).toMatchObject({ label: "Aguardando leitura", percent: null });
    expect(waiting.explanation).toMatch(/carregador/);
    expect(
      describeBattery({ support: "supported", level: { kind: "off", lastPercent: null } }),
    ).toEqual({ label: "Desligado", percent: null, tone: "muted", explanation: null });
    // Desligado com nível anterior: mostra o último nível, sem barra (não é o atual).
    const off = describeBattery({ support: "supported", level: { kind: "off", lastPercent: 100 } });
    expect(off).toMatchObject({ label: "Desligado · 100%", percent: null, tone: "muted" });
    expect(off.explanation).toMatch(/antes de desligar/);
    // Registro de antes (app fechado): nunca vira nível atual nem barra.
    const lastKnown = describeBattery({
      support: "supported",
      level: { kind: "lastKnown", percent: 80 },
    });
    expect(lastKnown).toMatchObject({
      label: "Último registro: 80%",
      percent: null,
      tone: "muted",
    });
    expect(lastKnown.explanation).toMatch(/última vez/);
  });

  it("descreve a conexão e o estado de carga quando conhecido", () => {
    expect(
      deviceSubtitle({ connection: "proprietary24Ghz", charging: "unknown", lastUpdated: null }),
    ).toBe("2.4 GHz · receptor USB conectado");
    const readAt = new Date(2026, 8, 28, 14, 5).toISOString();
    const charging = {
      connection: "proprietary24Ghz",
      charging: "charging",
      lastUpdated: readAt,
    } as const;
    expect(deviceSubtitle(charging, new Date(2026, 8, 28, 23, 59))).toBe(
      "2.4 GHz · Carregando · lido às 14:05",
    );
    // Leitura de outro dia (o receptor só avisa em eventos): mostra a data.
    expect(deviceSubtitle(charging, new Date(2026, 8, 29, 0, 1))).toBe(
      "2.4 GHz · Carregando · lido em 28/09 às 14:05",
    );
    expect(deviceSubtitle({ connection: "wireless", charging: "unknown", lastUpdated: null })).toBe(
      "Sem fio",
    );
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
