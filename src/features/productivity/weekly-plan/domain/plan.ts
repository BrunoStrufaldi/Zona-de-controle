import { type PlanBlock, type PlanBlockInput } from "@/features/productivity/weekly-plan/types";
import { WEEKDAYS, weekdayLong, weekdayShort } from "@/lib/weekdays";
import { type CategoryColor } from "@/types/palette";

/** Ordem das colunas: segunda a domingo. */
export const DISPLAY_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;

export const PLAN_LIMITS = { titleChars: 80, notesChars: 500 } as const;

/** Faixa mostrada sem blocos (ou quando eles cabem nela). */
const DEFAULT_RANGE = { start: 6 * 60, end: 22 * 60 };

export const MINUTES_PER_HOUR = 60;

export type TimedBlock = PlanBlock & { startTime: string; endTime: string };

export function isTimed(block: PlanBlock): block is TimedBlock {
  return block.startTime !== null && block.endTime !== null;
}

/** "08:30" → 510. */
export function toMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** 510 → "08:30". */
export function fromMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Horas inteiras mostradas na grade: a faixa padrão, ampliada para caber todos os blocos. */
export function gridRange(blocks: readonly PlanBlock[]): { start: number; end: number } {
  let { start, end } = DEFAULT_RANGE;
  for (const block of blocks.filter(isTimed)) {
    start = Math.min(start, toMinutes(block.startTime));
    end = Math.max(end, toMinutes(block.endTime));
  }
  return {
    start: Math.floor(start / MINUTES_PER_HOUR) * MINUTES_PER_HOUR,
    end: Math.min(24 * 60, Math.ceil(end / MINUTES_PER_HOUR) * MINUTES_PER_HOUR),
  };
}

/** Blocos com horário do dia, em ordem. */
export function timedBlocksOn(blocks: readonly PlanBlock[], weekday: number): TimedBlock[] {
  return blocks
    .filter(isTimed)
    .filter((block) => block.weekdays.includes(weekday))
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
}

export function allDayBlocksOn(blocks: readonly PlanBlock[], weekday: number): PlanBlock[] {
  return blocks.filter((block) => !isTimed(block) && block.weekdays.includes(weekday));
}

/** "08:00–15:00" ou "Dia inteiro". */
export function blockTimeLabel(block: PlanBlock): string {
  return isTimed(block) ? `${block.startTime}–${block.endTime}` : "Dia inteiro";
}

/** "Todos os dias", "Seg a sex", "Fim de semana" ou "seg, qua, sex". */
export function weekdaysLabel(weekdays: readonly number[]): string {
  const days = new Set(weekdays);
  if (days.size === WEEKDAYS.length) return "Todos os dias";
  const same = (list: readonly number[]) =>
    list.length === days.size && list.every((day) => days.has(day));
  if (same([1, 2, 3, 4, 5])) return "Seg a sex";
  if (same([0, 6])) return "Fim de semana";
  return DISPLAY_WEEKDAYS.filter((day) => days.has(day))
    .map(weekdayShort)
    .join(", ");
}

export interface NowAndNext {
  /** Bloco em andamento agora. */
  current: TimedBlock | null;
  /** Próximo bloco com horário a começar (até uma semana à frente). */
  next: { block: TimedBlock; daysAhead: number } | null;
}

/** O que está planejado para agora e o que vem a seguir. */
export function nowAndNext(blocks: readonly PlanBlock[], now: Date): NowAndNext {
  const today = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const current =
    timedBlocksOn(blocks, today).find(
      (block) => toMinutes(block.startTime) <= minutes && minutes < toMinutes(block.endTime),
    ) ?? null;

  for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
    const day = (today + daysAhead) % 7;
    const block = timedBlocksOn(blocks, day).find((candidate) => {
      const start = toMinutes(candidate.startTime);
      if (daysAhead === 0) return start > minutes;
      // Uma semana à frente, só o que começa antes de agora (o resto já apareceu hoje).
      return daysAhead < 7 || start <= minutes;
    });
    if (block) return { current, next: { block, daysAhead } };
  }
  return { current, next: null };
}

/** Quando o próximo bloco começa: "às 18:30", "amanhã às 06:00", "segunda-feira às 06:00". */
export function nextStartLabel(block: TimedBlock, daysAhead: number, now: Date): string {
  if (daysAhead === 0) return `às ${block.startTime}`;
  if (daysAhead === 1) return `amanhã às ${block.startTime}`;
  return `${weekdayLong((now.getDay() + daysAhead) % 7)} às ${block.startTime}`;
}

// ---- Formulário ---------------------------------------------------------------

export interface PlanDraft {
  title: string;
  notes: string;
  weekdays: number[];
  allDay: boolean;
  startTime: string;
  endTime: string;
  color: CategoryColor;
}

/** Bloco novo: o dia e o horário clicados na grade (1 h de duração), ou um padrão. */
export function newDraft(weekday: number | null, startMinutes: number | null): PlanDraft {
  const start = startMinutes ?? 8 * 60;
  return {
    title: "",
    notes: "",
    weekdays: weekday === null ? [] : [weekday],
    allDay: startMinutes === null && weekday !== null,
    startTime: fromMinutes(start),
    endTime: fromMinutes(Math.min(start + 60, 23 * 60 + 59)),
    color: "blue",
  };
}

export function draftOf(block: PlanBlock): PlanDraft {
  return {
    title: block.title,
    notes: block.notes,
    weekdays: [...block.weekdays],
    allDay: !isTimed(block),
    startTime: block.startTime ?? "08:00",
    endTime: block.endTime ?? "09:00",
    color: block.color,
  };
}

export type PlanDraftErrors = Partial<Record<"title" | "weekdays" | "time", string>>;

/** Mesmas regras do Rust (menos o conflito de horário, que só ele confere). */
export function validateDraft(draft: PlanDraft): PlanDraftErrors {
  const errors: PlanDraftErrors = {};
  const title = draft.title.trim();
  if (title === "") errors.title = "Informe o título.";
  else if (title.length > PLAN_LIMITS.titleChars) {
    errors.title = `Use no máximo ${PLAN_LIMITS.titleChars} caracteres.`;
  }
  if (draft.weekdays.length === 0) errors.weekdays = "Escolha pelo menos um dia.";
  if (!draft.allDay) {
    if (draft.startTime === "" || draft.endTime === "") {
      errors.time = "Informe o início e o fim.";
    } else if (toMinutes(draft.endTime) <= toMinutes(draft.startTime)) {
      errors.time = "O fim precisa ser depois do início (no mesmo dia).";
    }
  }
  return errors;
}

export function toPlanInput(draft: PlanDraft): PlanBlockInput {
  return {
    title: draft.title.trim(),
    notes: draft.notes.trim(),
    weekdays: [...draft.weekdays].sort((a, b) => a - b),
    startTime: draft.allDay ? null : draft.startTime,
    endTime: draft.allDay ? null : draft.endTime,
    color: draft.color,
  };
}
