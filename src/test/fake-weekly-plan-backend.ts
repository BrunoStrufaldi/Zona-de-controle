import { vi } from "vitest";

import { toMinutes } from "@/features/productivity/weekly-plan/domain/plan";
import { type PlanBlock, type PlanBlockInput } from "@/features/productivity/weekly-plan/types";
import { mockDesktopRuntime } from "@/test/tauri";

/** O Tauri rejeita com o AppError serializado (objeto puro). */
function fail(kind: string, message: string): never {
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  throw { kind, message };
}

/** Como o Rust: horários não se sobrepõem num dia em comum. */
function conflictOf(input: PlanBlockInput, id: number | null, blocks: PlanBlock[]) {
  if (input.startTime === null || input.endTime === null) return undefined;
  const [start, end] = [toMinutes(input.startTime), toMinutes(input.endTime)];
  return blocks.find(
    (block) =>
      block.id !== id &&
      block.startTime !== null &&
      block.endTime !== null &&
      block.weekdays.some((day) => input.weekdays.includes(day)) &&
      start < toMinutes(block.endTime) &&
      toMinutes(block.startTime) < end,
  );
}

/** Backend do planejamento semanal (e rotinas vazias) em memória. */
export function mockWeeklyPlanBackend(seeds: PlanBlock[] = []) {
  let blocks = [...seeds];
  let nextId = Math.max(0, ...seeds.map((block) => block.id)) + 1;

  const save = (id: number | null, input: PlanBlockInput): PlanBlock => {
    const conflict = conflictOf(input, id, blocks);
    if (conflict) fail("validation", `o horário conflita com “${conflict.title}”`);
    const block = { ...input, id: id ?? nextId++ };
    blocks = id === null ? [...blocks, block] : blocks.map((b) => (b.id === id ? block : b));
    return block;
  };

  const handlers = {
    list_routines: vi.fn(() => []),
    list_weekly_plan: vi.fn(() => blocks),
    create_plan_block: vi.fn((args: { input: PlanBlockInput }) => save(null, args.input)),
    update_plan_block: vi.fn((args: { id: number; input: PlanBlockInput }) =>
      save(args.id, args.input),
    ),
    delete_plan_block: vi.fn((args: { id: number }) => {
      blocks = blocks.filter((block) => block.id !== args.id);
      return null;
    }),
  };
  mockDesktopRuntime(handlers);
  return { handlers, blocks: () => blocks };
}
