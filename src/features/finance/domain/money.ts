import { type Cents } from "@/features/finance/types";

/** Maior valor aceito, espelhado de `MAX_AMOUNT_CENTS` no Rust (R$ 999.999.999,99). */
export const MAX_AMOUNT_CENTS: Cents = 99_999_999_999;

const AMOUNT_PATTERN = /^\d+(?:[.,]\d{1,2})?$/;

/**
 * Converte o valor digitado em centavos. Aceita o formato brasileiro
 * ("1.234,56", "12,5") e ponto decimal com até 2 casas ("12.50"). Sem vírgula,
 * pontos seguidos de 3 dígitos são separadores de milhar ("1.234" = 1234).
 * Retorna `null` quando o texto não é um valor válido.
 */
export function parseAmount(text: string): Cents | null {
  let value = text
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "");
  if (value === "") return null;

  if (value.includes(",")) {
    // Vírgula decimal: os pontos só podem ser separadores de milhar.
    if (!/^\d{1,3}(?:\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(value)) return null;
    value = value.replace(/\./g, "");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) {
    value = value.replace(/\./g, "");
  }

  if (!AMOUNT_PATTERN.test(value)) return null;
  const [reais = "0", fraction = ""] = value.split(/[.,]/);
  const cents = Number(reais) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Centavos para edição no campo de valor: 123456 → "1234,56". */
export function toAmountInput(cents: Cents): string {
  const absolute = Math.abs(cents);
  const reais = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${reais},${fraction}`;
}

/**
 * Saldo inicial digitado (pode ser negativo, ex.: fatura em aberto): "-1.500,00".
 * Retorna `null` quando inválido.
 */
export function parseSignedAmount(text: string): Cents | null {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  const negative = trimmed.startsWith("-");
  const cents = parseAmount(negative ? trimmed.slice(1) : trimmed);
  if (cents === null) return null;
  return negative ? -cents : cents;
}
