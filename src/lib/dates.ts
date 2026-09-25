import { type IsoDate } from "@/types/common";

/**
 * Operações com datas de calendário locais (`aaaa-mm-dd`), sem fuso horário.
 * Para exibição, use `src/lib/format.ts`.
 */

const pad = (value: number) => String(value).padStart(2, "0");

/** Data local do instante informado, como `aaaa-mm-dd`. */
export function toIsoDate(date: Date): IsoDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseIsoDate(value: IsoDate): Date {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Soma dias a uma data (valores negativos subtraem). */
export function addDays(value: IsoDate, days: number): IsoDate {
  const date = parseIsoDate(value);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Dias de `from` até `to` (negativo se `to` for anterior). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const MS_PER_DAY = 86_400_000;
  // UTC evita distorção pelo horário de verão.
  const utc = (value: IsoDate) => {
    const date = parseIsoDate(value);
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  };
  return Math.round((utc(to) - utc(from)) / MS_PER_DAY);
}

/** Dia da semana: 0 = domingo … 6 = sábado. */
export function weekdayOf(value: IsoDate): number {
  return parseIsoDate(value).getDay();
}

/**
 * Soma meses mantendo o dia `anchorDay`, limitado ao último dia do mês
 * (ex.: 31/01 + 1 mês = 28/02 ou 29/02).
 */
export function addMonths(value: IsoDate, months: number, anchorDay: number): IsoDate {
  const date = parseIsoDate(value);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + months + 1, 0).getDate();
  return toIsoDate(
    new Date(date.getFullYear(), date.getMonth() + months, Math.min(anchorDay, lastDay)),
  );
}

/** Dia do mês (1–31) de uma data `aaaa-mm-dd`. */
export function dayOfMonth(value: IsoDate): number {
  return parseIsoDate(value).getDate();
}
