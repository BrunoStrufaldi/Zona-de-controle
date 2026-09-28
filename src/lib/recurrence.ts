import { weekdayShort } from "@/lib/weekdays";
import { type RecurrenceFrequency } from "@/types/recurrence";

/** Rótulos e descrições de regras de repetição (tarefas e eventos). */

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

export interface RepeatRule {
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays: readonly number[];
}

/** Descrição curta (ex.: "Todo dia", "A cada 2 semanas: seg, qua"). */
export function describeRepeat(rule: RepeatRule): string {
  const base =
    rule.interval === 1
      ? everyLabels[rule.frequency]
      : `A cada ${rule.interval} ${intervalUnit(rule.frequency, rule.interval)}`;
  if (rule.frequency !== "weekly" || rule.weekdays.length === 0) return base;
  const days = [...rule.weekdays].sort((a, b) => a - b).map(weekdayShort);
  return `${base}: ${days.join(", ")}`;
}
