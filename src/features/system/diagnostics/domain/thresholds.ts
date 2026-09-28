import { type DiagnosticThresholds } from "@/features/system/diagnostics/types";

export type ThresholdKey = keyof DiagnosticThresholds;

export interface ThresholdField {
  key: ThresholdKey;
  label: string;
  unit: "%" | "GB";
}

export interface ThresholdGroup {
  title: string;
  fields: readonly ThresholdField[];
}

/** Campos do formulário de limites, agrupados como na tela Diagnósticos. */
export const THRESHOLD_GROUPS: readonly ThresholdGroup[] = [
  {
    title: "Armazenamento",
    fields: [
      { key: "diskAttentionPercent", label: "Atenção a partir de", unit: "%" },
      { key: "diskCriticalPercent", label: "Crítico a partir de", unit: "%" },
      { key: "systemDiskMinFreeGb", label: "Mínimo livre na unidade do Windows", unit: "GB" },
    ],
  },
  {
    title: "Memória",
    fields: [
      { key: "memoryAttentionPercent", label: "Atenção a partir de", unit: "%" },
      { key: "memoryCriticalPercent", label: "Crítico a partir de", unit: "%" },
      {
        key: "pageFileAttentionPercent",
        label: "Arquivo de paginação: atenção a partir de",
        unit: "%",
      },
    ],
  },
  {
    title: "Programas",
    fields: [
      { key: "programMemoryPercent", label: "Citar acima de (memória)", unit: "%" },
      { key: "programCpuPercent", label: "Citar acima de (CPU)", unit: "%" },
    ],
  },
];

export type ThresholdsForm = Record<ThresholdKey, string>;

export function toThresholdsForm(thresholds: DiagnosticThresholds): ThresholdsForm {
  const form = {} as ThresholdsForm;
  for (const key of Object.keys(thresholds) as ThresholdKey[]) {
    form[key] = String(thresholds[key]);
  }
  return form;
}

export type ParsedThresholds =
  { ok: true; thresholds: DiagnosticThresholds } | { ok: false; key: ThresholdKey; error: string };

/** Nenhum limite válido passa disso; acima, o valor nem caberia no inteiro do Rust. */
const MAX_FORM_VALUE = 1_000_000;

/**
 * Converte o formulário em inteiros não negativos (o que o Rust consegue
 * receber). As faixas e a regra "atenção < crítico" são validadas no Rust
 * (fonte da verdade), com mensagens próprias.
 */
export function parseThresholdsForm(form: ThresholdsForm): ParsedThresholds {
  const thresholds = {} as DiagnosticThresholds;
  for (const key of Object.keys(form) as ThresholdKey[]) {
    const text = form[key].trim();
    const value = Number(text);
    if (text === "" || !Number.isInteger(value) || value < 0) {
      return { ok: false, key, error: "Informe um número inteiro positivo." };
    }
    if (value > MAX_FORM_VALUE) {
      return { ok: false, key, error: "Valor alto demais." };
    }
    thresholds[key] = value;
  }
  return { ok: true, thresholds };
}

export function sameThresholds(a: DiagnosticThresholds, b: DiagnosticThresholds): boolean {
  return (Object.keys(a) as ThresholdKey[]).every((key) => a[key] === b[key]);
}
