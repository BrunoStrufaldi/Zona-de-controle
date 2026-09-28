import { describe, expect, it } from "vitest";

import {
  checkCriteria,
  checkSummary,
  describeFinding,
  groupByCheck,
  reportHealth,
} from "@/features/system/diagnostics/domain/findings";
import {
  parseThresholdsForm,
  sameThresholds,
  toThresholdsForm,
} from "@/features/system/diagnostics/domain/thresholds";
import { type DiagnosticFinding, type DiagnosticReport } from "@/features/system/diagnostics/types";
import { DEFAULT_THRESHOLDS, SAMPLE_FINDINGS } from "@/test/fake-diagnostics-backend";

const GIB = 1024 ** 3;

function report(findings: DiagnosticFinding[], cpuMeasured = true): DiagnosticReport {
  return {
    findings,
    checkedDisks: 1,
    checkedPrograms: 12,
    cpuMeasured,
    thresholds: DEFAULT_THRESHOLDS,
  };
}

describe("achados do diagnóstico", () => {
  it("agrupa por verificação na ordem fixa, com o pior estado de cada uma", () => {
    const groups = groupByCheck(report(SAMPLE_FINDINGS));
    expect(groups.map((group) => [group.check, group.status, group.findings.length])).toEqual([
      ["storage", "critical", 1],
      ["memory", "attention", 1],
      ["programs", "attention", 1],
    ]);
    expect(reportHealth(report(SAMPLE_FINDINGS))).toBe("critical");
    expect(reportHealth(report([]))).toBe("healthy");
  });

  it("descreve pouco espaço na unidade do sistema", () => {
    const text = describeFinding(SAMPLE_FINDINGS[0] as DiagnosticFinding);
    expect(text.title).toBe("Pouco espaço livre em C:");
    expect(text.detail).toBe("95,1% em uso · 11 GB livres de 223 GB");
    expect(text.recommendation).toMatch(/Lixeira/);
  });

  it("não arredonda o uso para o limite seguinte", () => {
    // 89,6% é atenção com crítico em 90%: o texto não pode dizer "90%".
    const text = describeFinding({
      severity: "attention",
      kind: "diskSpace",
      mountPoint: "C:",
      label: "",
      usedBytes: 896,
      totalBytes: 1000,
      systemDrive: false,
      lowFreeSpace: false,
    });
    expect(text.detail).toMatch(/^89,6% em uso/);
  });

  it("descreve unidade quase cheia com rótulo", () => {
    const text = describeFinding({
      severity: "attention",
      kind: "diskSpace",
      mountPoint: "D:",
      label: "Dados",
      usedBytes: 85 * GIB,
      totalBytes: 100 * GIB,
      systemDrive: false,
      lowFreeSpace: false,
    });
    expect(text.title).toBe("Unidade D: (Dados) quase cheia");
    expect(text.recommendation).not.toMatch(/Windows/);
  });

  it("descreve memória, paginação e programas", () => {
    expect(
      describeFinding({
        severity: "critical",
        kind: "memory",
        usedBytes: 29 * GIB,
        totalBytes: 32 * GIB,
      }).title,
    ).toBe("Memória quase esgotada");
    expect(
      describeFinding({
        severity: "attention",
        kind: "pageFile",
        usedBytes: 9 * GIB,
        totalBytes: 10 * GIB,
      }).detail,
    ).toBe("9 GB de 10 GB em uso");
    expect(
      describeFinding({
        severity: "attention",
        kind: "programCpu",
        name: "navegador.exe",
        instances: 12,
        cpuPercent: 62.4,
      }),
    ).toMatchObject({
      title: "“navegador.exe” (12 processos) usa muita CPU",
      detail: "62% da CPU no momento da análise",
    });
    expect(describeFinding(SAMPLE_FINDINGS[2] as DiagnosticFinding).detail).toBe(
      "15 GB · 46,9% da RAM",
    );
  });

  it("resume o que foi verificado e com quais limites", () => {
    expect(checkSummary("storage", report([]))).toBe(
      "1 unidade fixa verificada. Unidades removíveis não entram.",
    );
    expect(checkSummary("programs", report([], false))).toMatch(/CPU não pôde ser medido/);
    expect(checkCriteria("storage", report([]))).toMatch(/80%.*90%.*15 GB/);
  });
});

describe("formulário de limites", () => {
  it("converte ida e volta", () => {
    const form = toThresholdsForm(DEFAULT_THRESHOLDS);
    expect(form.diskCriticalPercent).toBe("90");
    expect(parseThresholdsForm(form)).toEqual({ ok: true, thresholds: DEFAULT_THRESHOLDS });
  });

  it("recusa vazio e não inteiro, apontando o campo", () => {
    const form = toThresholdsForm(DEFAULT_THRESHOLDS);
    expect(parseThresholdsForm({ ...form, programCpuPercent: " " })).toMatchObject({
      ok: false,
      key: "programCpuPercent",
    });
    expect(parseThresholdsForm({ ...form, memoryAttentionPercent: "80,5" })).toMatchObject({
      ok: false,
      key: "memoryAttentionPercent",
    });
    expect(parseThresholdsForm({ ...form, diskAttentionPercent: "-5" })).toMatchObject({
      ok: false,
      key: "diskAttentionPercent",
    });
    expect(parseThresholdsForm({ ...form, systemDiskMinFreeGb: "99999999999" })).toMatchObject({
      ok: false,
      error: "Valor alto demais.",
    });
  });

  it("compara limites", () => {
    expect(sameThresholds(DEFAULT_THRESHOLDS, { ...DEFAULT_THRESHOLDS })).toBe(true);
    expect(
      sameThresholds(DEFAULT_THRESHOLDS, { ...DEFAULT_THRESHOLDS, programCpuPercent: 51 }),
    ).toBe(false);
  });
});
