/** Dias da semana: 0 = domingo … 6 = sábado (mesmo padrão do Rust). */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;
export const WEEKDAY_LONG = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

/** Nome curto do dia (ex.: "seg"); "?" para valores fora de 0–6. */
export function weekdayShort(day: number): string {
  return WEEKDAY_SHORT[day] ?? "?";
}

/** Nome completo do dia (ex.: "segunda-feira"); "?" para valores fora de 0–6. */
export function weekdayLong(day: number): string {
  return WEEKDAY_LONG[day] ?? "?";
}
