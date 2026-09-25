import { describe, expect, it } from "vitest";

import { describeDue, getDueState } from "@/features/productivity/tasks/domain/due";
import {
  DEFAULT_TASK_FILTERS,
  filterTasks,
  groupByStatus,
  hasActiveFilters,
  sortForList,
} from "@/features/productivity/tasks/domain/filters";
import { applyMove, resolveDrop } from "@/features/productivity/tasks/domain/ordering";
import { summarizeToday } from "@/features/productivity/tasks/domain/summary";
import { mergeTags, validateTaskInput } from "@/features/productivity/tasks/domain/validation";
import { type Task } from "@/features/productivity/tasks/types";

let nextId = 1;
function task(overrides: Partial<Task> = {}): Task {
  const id = overrides.id ?? nextId++;
  return {
    id,
    title: `Tarefa ${id}`,
    description: "",
    status: "todo",
    priority: "medium",
    dueDate: null,
    position: id,
    tags: [],
    completedAt: null,
    createdAt: "2026-09-01T12:00:00Z",
    updatedAt: "2026-09-01T12:00:00Z",
    ...overrides,
  };
}

const TODAY = "2026-09-25";

describe("vencimento", () => {
  it("classifica a situação em relação a hoje", () => {
    expect(getDueState(task({ dueDate: "2026-09-20" }), TODAY)).toBe("overdue");
    expect(getDueState(task({ dueDate: TODAY }), TODAY)).toBe("today");
    expect(getDueState(task({ dueDate: "2026-09-28" }), TODAY)).toBe("soon");
    expect(getDueState(task({ dueDate: "2026-10-10" }), TODAY)).toBe("later");
    expect(getDueState(task(), TODAY)).toBe("none");
    expect(getDueState(task({ dueDate: "2026-09-20", status: "done" }), TODAY)).toBe("completed");
  });

  it("descreve o vencimento em texto", () => {
    expect(describeDue(TODAY, TODAY)).toBe("Hoje");
    expect(describeDue("2026-09-26", TODAY)).toBe("Amanhã");
    expect(describeDue("2026-09-22", TODAY)).toBe("Atrasada há 3 dias");
    expect(describeDue("2026-10-05", TODAY)).toBe("Em 10 dias");
  });
});

describe("filtros e ordenação", () => {
  const tasks = [
    task({ id: 1, title: "Relatório mensal", tags: ["trabalho"], priority: "high" }),
    task({ id: 2, title: "Comprar pão", status: "done", completedAt: "2026-09-25T10:00:00Z" }),
    task({ id: 3, title: "Revisão", description: "Ver ORÇAMENTO", status: "in_progress" }),
  ];

  it("mostra só as abertas por padrão", () => {
    expect(filterTasks(tasks, DEFAULT_TASK_FILTERS).map((t) => t.id)).toEqual([1, 3]);
    expect(hasActiveFilters(DEFAULT_TASK_FILTERS)).toBe(false);
  });

  it("busca sem diferenciar acentos e maiúsculas, inclusive na descrição", () => {
    const result = filterTasks(tasks, {
      ...DEFAULT_TASK_FILTERS,
      status: "all",
      search: "orcamento",
    });
    expect(result.map((t) => t.id)).toEqual([3]);
  });

  it("filtra por prioridade e tag; o Kanban ignora o status", () => {
    const filters = { ...DEFAULT_TASK_FILTERS, status: "done" as const, tag: "trabalho" };
    expect(filterTasks(tasks, filters)).toEqual([]);
    expect(filterTasks(tasks, filters, { ignoreStatus: true }).map((t) => t.id)).toEqual([1]);
    expect(hasActiveFilters(filters)).toBe(true);
  });

  it("ordena: abertas, vencimento mais próximo, prioridade", () => {
    const sorted = sortForList([
      task({ id: 10, status: "done" }),
      task({ id: 11, dueDate: null, priority: "urgent" }),
      task({ id: 12, dueDate: "2026-10-01", priority: "low" }),
      task({ id: 13, dueDate: "2026-09-26", priority: "low" }),
      task({ id: 14, dueDate: "2026-09-26", priority: "urgent" }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual([14, 13, 12, 11, 10]);
  });
});

describe("resumo do dia", () => {
  it("conta concluídas hoje, atrasadas e lista as próximas", () => {
    const now = new Date(2026, 8, 25, 15, 0);
    const summary = summarizeToday(
      [
        task({ id: 1, dueDate: "2026-09-20", priority: "low" }),
        task({ id: 2, dueDate: TODAY }),
        task({ id: 3, status: "done", completedAt: new Date(2026, 8, 25, 9).toISOString() }),
        task({ id: 4, status: "done", completedAt: new Date(2026, 8, 20, 9).toISOString() }),
        task({ id: 5, dueDate: "2026-09-30", priority: "urgent" }),
        task({ id: 6, dueDate: "2026-10-30" }),
      ],
      now,
    );

    expect(summary.completedToday).toBe(1);
    expect(summary.overdue).toBe(1);
    expect(summary.plannedToday).toBe(3);
    expect(summary.upcoming.map((t) => t.id)).toEqual([1, 2, 5]);
  });
});

describe("Kanban", () => {
  const tasks = [
    task({ id: 1, position: 1 }),
    task({ id: 2, position: 2 }),
    task({ id: 3, position: 3 }),
    task({ id: 4, status: "done", position: 1, completedAt: "2026-09-24T10:00:00Z" }),
  ];
  const columns = groupByStatus(tasks);

  it("resolve o destino ao soltar", () => {
    // Para baixo na mesma coluna: fica depois do alvo.
    expect(resolveDrop(columns, 1, { type: "task", id: 2 })).toEqual({
      status: "todo",
      beforeId: 3,
    });
    expect(resolveDrop(columns, 1, { type: "task", id: 3 })).toEqual({
      status: "todo",
      beforeId: null,
    });
    // Para cima: fica antes do alvo.
    expect(resolveDrop(columns, 3, { type: "task", id: 1 })).toEqual({
      status: "todo",
      beforeId: 1,
    });
    // Outra coluna: antes do alvo ou no fim.
    expect(resolveDrop(columns, 2, { type: "task", id: 4 })).toEqual({
      status: "done",
      beforeId: 4,
    });
    expect(resolveDrop(columns, 2, { type: "column", status: "in_progress" })).toEqual({
      status: "in_progress",
      beforeId: null,
    });
    // Sem mudança.
    expect(resolveDrop(columns, 2, { type: "task", id: 2 })).toBeNull();
    expect(resolveDrop(columns, 3, { type: "column", status: "todo" })).toBeNull();
  });

  it("aplica o movimento localmente e ajusta a conclusão", () => {
    const now = new Date("2026-09-25T12:00:00Z");
    const moved = applyMove(tasks, 1, { status: "done", beforeId: 4 }, now);
    const grouped = groupByStatus(moved);

    expect(grouped.todo.map((t) => t.id)).toEqual([2, 3]);
    expect(grouped.done.map((t) => t.id)).toEqual([1, 4]);
    expect(moved.find((t) => t.id === 1)?.completedAt).toBe(now.toISOString());

    const reopened = applyMove(moved, 4, { status: "todo", beforeId: null }, now);
    expect(reopened.find((t) => t.id === 4)?.completedAt).toBeNull();
  });
});

describe("validação", () => {
  it("exige título e respeita limites", () => {
    const base = {
      title: "Ok",
      description: "",
      status: "todo",
      priority: "low",
      dueDate: null,
      tags: [],
    } as const;
    expect(validateTaskInput({ ...base, tags: [] })).toEqual({});
    expect(validateTaskInput({ ...base, title: "  ", tags: [] }).title).toBeDefined();
    expect(
      validateTaskInput({ ...base, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }).tags,
    ).toBeDefined();
  });

  it("normaliza e deduplica tags", () => {
    expect(mergeTags(["casa"], [" Casa ", "Trabalho  Remoto", ""])).toEqual([
      "casa",
      "trabalho remoto",
    ]);
  });
});
