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
