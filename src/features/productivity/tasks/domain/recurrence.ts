import { type RecurrenceFrequency, type TaskRecurrence } from "@/features/productivity/tasks/types";
import { addDays, addMonths, dayOfMonth, daysBetween, weekdayOf } from "@/lib/dates";
import { weekdayShort } from "@/lib/weekdays";
import { type IsoDate } from "@/types/common";

/**
 * Recorrência — espelha `src-tauri/src/domain/task_recurrence.rs` (o backend
 * é a fonte da verdade; aqui serve para a prévia no formulário).
 */

export const MAX_RECURRENCE_INTERVAL = 99;

export const frequencyLabels: Record<RecurrenceFrequency, string> = {
  daily: "Diariamente",
  weekly: "Semanalmente",
  monthly: "Mensalmente",
  yearly: "Anualmente",
};

/** Unidade do intervalo, no singular e no plural. */
const intervalUnits: Record<RecurrenceFrequency, [string, string]> = {
  daily: ["dia", "dias"],
  weekly: ["semana", "semanas"],
  monthly: ["mês", "meses"],
  yearly: ["ano", "anos"],
};

export function intervalUnit(frequency: RecurrenceFrequency, interval: number): string {
  const [singular, plural] = intervalUnits[frequency];
  return interval === 1 ? singular : plural;
}

const everyLabels: Record<RecurrenceFrequency, string> = {
  daily: "Todo dia",
  weekly: "Toda semana",
  monthly: "Todo mês",
  yearly: "Todo ano",
};

/** Descrição curta (ex.: "Todo dia", "A cada 2 semanas: seg, qua"). */
export function describeRecurrence(rule: TaskRecurrence): string {
  const base =
    rule.interval === 1
      ? everyLabels[rule.frequency]
      : `A cada ${rule.interval} ${intervalUnit(rule.frequency, rule.interval)}`;
  if (rule.frequency !== "weekly" || rule.weekdays.length === 0) return base;
  const days = [...rule.weekdays].sort((a, b) => a - b).map(weekdayShort);
  return `${base}: ${days.join(", ")}`;
}

/** Regra padrão ao ativar a repetição no formulário. */
export function defaultRecurrence(frequency: RecurrenceFrequency = "weekly"): TaskRecurrence {
  return { frequency, interval: 1, weekdays: [] };
}

/**
 * Próximo vencimento: a primeira data da regra depois de `due` **e** depois
 * de `today` — concluir com atraso não gera uma ocorrência já vencida.
 */
export function nextOccurrence(rule: TaskRecurrence, due: IsoDate, today: IsoDate): IsoDate {
  const interval = rule.interval;
  switch (rule.frequency) {
    case "daily":
      return nextByDays(due, today, interval);
    case "weekly": {
      if (rule.weekdays.length === 0) return nextByDays(due, today, interval * 7);
      const weekdays = [...new Set(rule.weekdays)].sort((a, b) => a - b);
      let next = nextWeekday(due, weekdays, interval);
      while (next <= today) next = nextWeekday(next, weekdays, interval);
      return next;
    }
    case "monthly":
    case "yearly": {
      const months = rule.frequency === "monthly" ? interval : interval * 12;
      // Conta a partir do vencimento original para não "escorregar" o dia.
      const anchor = dayOfMonth(due);
      for (let step = 1; ; step++) {
        const next = addMonths(due, months * step, anchor);
        if (next > today) return next;
      }
    }
  }
}

function nextByDays(due: IsoDate, today: IsoDate, step: number): IsoDate {
  let next = addDays(due, step);
  if (next <= today) {
    const behind = daysBetween(next, addDays(today, 1));
    next = addDays(next, Math.ceil(behind / step) * step);
  }
  return next;
}

/** Próximo dia marcado depois de `from`, na mesma semana ou `interval` semanas depois. */
function nextWeekday(from: IsoDate, weekdays: readonly number[], interval: number): IsoDate {
  const current = weekdayOf(from);
  const later = weekdays.find((day) => day > current);
  if (later !== undefined) return addDays(from, later - current);
  const weekStart = addDays(from, -current);
  return addDays(weekStart, interval * 7 + (weekdays[0] ?? current));
}
