import { describe, expect, it } from "vitest";

import {
  biosGuide,
  boardVendor,
  describeHardwareFinding,
  formatMicrocode,
  secureBootLabel,
} from "@/features/system/system-settings/domain/hardware";
import {
  activePlanLabel,
  describeSettingsFinding,
  gpuSchedulingLabel,
  startupCounts,
} from "@/features/system/system-settings/domain/settings";
import { sampleWindowsSettings } from "@/test/fake-system-settings-backend";

describe("textos dos ajustes do Windows", () => {
  it("plano de energia avisa da bateria só em notebooks", () => {
    const base = {
      level: "suggestion",
      kind: "powerPlan",
      current: null,
      suggestedGuid: "x",
      suggestedName: "Alto desempenho",
    } as const;
    const desktop = describeSettingsFinding({ ...base, hasBattery: false });
    expect(desktop.detail).toBe("Atual: não identificado → sugerido: Alto desempenho");
    expect(desktop.recommendation).not.toContain("bateria");
    expect(describeSettingsFinding({ ...base, hasBattery: true }).recommendation).toContain(
      "No notebook, a bateria dura menos.",
    );
  });

  it("reinício pendente cita as duas origens", () => {
    const text = describeSettingsFinding({
      level: "attention",
      kind: "pendingReboot",
      windowsUpdate: true,
      servicing: true,
    });
    expect(text.detail).toBe(
      "O Windows precisa reiniciar: o Windows Update instalou atualizações e a manutenção de componentes do Windows está esperando.",
    );
  });

  it("Modern Standby e HAGS", () => {
    const power = sampleWindowsSettings().power;
    if (!power) throw new Error("a leitura fictícia tem plano de energia");
    expect(activePlanLabel(power)).toBe("Meu plano");
    expect(activePlanLabel({ ...power, modernStandby: true })).toBe(
      "Modos de energia (Modern Standby)",
    );
    expect(gpuSchedulingLabel({ name: "x", supported: false, enabled: false })).toBe(
      "Não suportado pela placa ou pelo driver",
    );
    expect(gpuSchedulingLabel({ name: "x", supported: true, enabled: false })).toBe("Desligado");
  });

  it("conta ligados e desligados, incluindo os apps da Store", () => {
    const report = sampleWindowsSettings().startup;
    expect(startupCounts(report)).toEqual({ enabled: 2, disabled: 2 });
    report.packaged.push({ package: "x", taskId: "y", state: "unknown" });
    expect(startupCounts(report)).toEqual({ enabled: 2, disabled: 2 });
  });
});

describe("textos do hardware", () => {
  it("microcódigo em hexadecimal, como a Intel publica", () => {
    expect(formatMicrocode(0x12f)).toBe("0x12F");
  });

  it("suspeita de XMP nunca é apresentada como certeza", () => {
    const text = describeHardwareFinding({
      level: "attention",
      kind: "memoryBelowRated",
      modules: [{ locator: null, configuredMts: 4800, maxMts: 6000 }],
    });
    expect(text.detail).toBe("Módulo: 4.800 MT/s de 6.000 MT/s");
    expect(text.recommendation).toContain("Não é certeza");
    expect(text.guide).toBe("memoryProfile");
  });

  it("Secure Boot em firmware legado não se aplica", () => {
    expect(secureBootLabel(false, "legacy")).toBe("Não se aplica (BIOS legado)");
    expect(secureBootLabel(null, "uefi")).toBe("Não disponível");
    expect(secureBootLabel(true, "uefi")).toBe("Ligado");
  });

  it("reconhece a fabricante da placa para o passo a passo", () => {
    expect(boardVendor({ manufacturer: "ASUSTeK COMPUTER INC.", product: null })).toBe("asus");
    expect(boardVendor({ manufacturer: "Micro-Star International Co., Ltd.", product: null })).toBe(
      "msi",
    );
    expect(boardVendor({ manufacturer: "Outra", product: null })).toBeNull();
    expect(boardVendor(null)).toBeNull();
  });

  it("guia da BIOS cita o modelo, a versão instalada e o XMP depois da atualização", () => {
    const guide = biosGuide(
      "biosUpdate",
      { manufacturer: "Gigabyte Technology Co., Ltd.", product: "PLACA X" },
      "F10",
    );
    expect(guide.steps[0]).toContain("No site da Gigabyte");
    expect(guide.steps[0]).toContain("modelo PLACA X");
    expect(guide.steps[0]).toContain("(a instalada é a F10)");
    expect(guide.steps.join(" ")).toContain("Q-Flash");
    expect(guide.steps.join(" ")).toContain("reative o perfil de memória");

    const generic = biosGuide("memoryProfile", null, null);
    expect(generic.steps[1]).toContain("XMP (Intel) ou EXPO/DOCP (AMD)");
  });
});
