import { APP_CURRENCY, APP_LOCALE } from "@/lib/locale";

/**
 * Utilitários centrais de formatação. Toda exibição de moeda, data e número
 * deve passar por aqui para manter o padrão pt-BR em toda a aplicação.
 */

const currencyFormatter = new Intl.NumberFormat(APP_LOCALE, {
  style: "currency",
  currency: APP_CURRENCY,
});

const compactCurrencyFormatter = new Intl.NumberFormat(APP_LOCALE, {
  style: "currency",
  currency: APP_CURRENCY,
  notation: "compact",
  maximumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const longDateFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const monthShortFormatter = new Intl.DateTimeFormat(APP_LOCALE, { month: "short" });

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DateInput = Date | string | number;

/**
 * Converte a entrada em `Date`. Strings no formato `aaaa-mm-dd` são tratadas
 * como data local (e não UTC), evitando que a data "volte um dia" no Brasil.
 */
export function toDate(input: DateInput): Date {
  if (input instanceof Date) return input;
  if (typeof input === "string") {
    const match = DATE_ONLY_PATTERN.exec(input);
    if (match) {
      const [, year, month, day] = match;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }
  return new Date(input);
}

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

/** R$ 1.234,56 */
export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

/** R$ 1,2 mil */
export function formatCompactCurrency(value: number): string {
  return compactCurrencyFormatter.format(value);
}

/** 1.234,5 */
export function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits }).format(value);
}

/** Recebe uma fração (0.125) e retorna "12,5%". */
export function formatPercent(fraction: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(APP_LOCALE, {
    style: "percent",
    maximumFractionDigits,
  }).format(fraction);
}

/** dd/mm/aaaa — retorna "—" para datas inválidas. */
export function formatDate(input: DateInput): string {
  const date = toDate(input);
  return isValidDate(date) ? dateFormatter.format(date) : "—";
}

/** dd/mm/aaaa hh:mm — retorna "—" para datas inválidas. */
export function formatDateTime(input: DateInput): string {
  const date = toDate(input);
  return isValidDate(date) ? dateTimeFormatter.format(date).replace(",", "") : "—";
}

/** "quinta-feira, 25 de setembro" */
export function formatLongDate(input: DateInput): string {
  const date = toDate(input);
  return isValidDate(date) ? longDateFormatter.format(date) : "—";
}

/** "set" (sem ponto final) */
export function formatMonthShort(input: DateInput): string {
  const date = toDate(input);
  return isValidDate(date) ? monthShortFormatter.format(date).replace(".", "") : "—";
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

/** 1536 → "1,5 KB" (base 1024). */
export function formatBytes(bytes: number, maximumFractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${formatNumber(value, maximumFractionDigits)} ${BYTE_UNITS[exponent] ?? "B"}`;
}
