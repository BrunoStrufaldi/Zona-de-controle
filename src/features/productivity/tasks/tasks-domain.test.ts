import { describe, expect, it } from "vitest";

import {
  suggestCategoryColor,
  validateCategoryInput,
} from "@/features/productivity/tasks/domain/categories";
import {
  applyChecklistToggle,
  checklistProgress,
} from "@/features/productivity/tasks/domain/checklist";
import { describeDue, getDueState } from "@/features/productivity/tasks/domain/due";
import {
  DEFAULT_TASK_FILTERS,
  filterTasks,
  groupByStatus,
  hasActiveFilters,
  sortForList,
} from "@/features/productivity/tasks/domain/filters";
import { emptyTaskInput } from "@/features/productivity/tasks/domain/input";
import { applyMove, resolveDrop } from "@/features/productivity/tasks/domain/ordering";
import {
  describeRecurrence,
  nextOccurrence,
} from "@/features/productivity/tasks/domain/recurrence";
import { summarizeToday } from "@/features/productivity/tasks/domain/summary";
import { validateTaskInput } from "@/features/productivity/tasks/domain/validation";
import {
  type Task,
  type TaskCategory,
  type TaskRecurrence,
} from "@/features/productivity/tasks/types";
import { mergeTags } from "@/lib/tags";

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
    categoryId: null,
    recurrence: null,
    checklist: [],
    completedAt: null,
    archivedAt: null,
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
    task({
      id: 4,
      title: "Mudança",
      categoryId: 7,
      checklist: [{ id: 1, text: "Contratar caminhão", done: false }],
    }),
  ];

  it("mostra só as abertas por padrão", () => {
    expect(filterTasks(tasks, DEFAULT_TASK_FILTERS).map((t) => t.id)).toEqual([1, 3, 4]);
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

  it("busca também nos itens da checklist e filtra por categoria", () => {
    const search = { ...DEFAULT_TASK_FILTERS, search: "caminhao" };
    expect(filterTasks(tasks, search).map((t) => t.id)).toEqual([4]);

    const byCategory = { ...DEFAULT_TASK_FILTERS, category: 7 };
    expect(filterTasks(tasks, byCategory).map((t) => t.id)).toEqual([4]);
    expect(hasActiveFilters(byCategory)).toBe(true);
    const uncategorized = { ...DEFAULT_TASK_FILTERS, category: "none" as const };
    expect(filterTasks(tasks, uncategorized).map((t) => t.id)).toEqual([1, 3]);
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
  const base = { ...emptyTaskInput(), title: "Ok" };

  it("exige título e respeita limites", () => {
    expect(validateTaskInput(base)).toEqual({});
    expect(validateTaskInput({ ...base, title: "  " }).title).toBeDefined();
    expect(
      validateTaskInput({ ...base, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }).tags,
    ).toBeDefined();
  });

  it("exige vencimento e intervalo válido na recorrência", () => {
    const weekly: TaskRecurrence = { frequency: "weekly", interval: 1, weekdays: [] };
    expect(validateTaskInput({ ...base, recurrence: weekly }).recurrence).toMatch(/vencimento/);
    expect(
      validateTaskInput({ ...base, dueDate: TODAY, recurrence: { ...weekly, interval: 0 } })
        .recurrence,
    ).toMatch(/intervalo/);
    expect(validateTaskInput({ ...base, dueDate: TODAY, recurrence: weekly })).toEqual({});
  });

  it("limita a checklist, ignorando itens vazios", () => {
    const items = (count: number, text = "item") =>
      Array.from({ length: count }, () => ({ text, done: false }));
    expect(validateTaskInput({ ...base, checklist: [...items(50), ...items(3, " ")] })).toEqual({});
    expect(validateTaskInput({ ...base, checklist: items(51) }).checklist).toBeDefined();
    expect(
      validateTaskInput({ ...base, checklist: items(1, "x".repeat(201)) }).checklist,
    ).toBeDefined();
  });

  it("normaliza e deduplica tags", () => {
    expect(mergeTags(["casa"], [" Casa ", "Trabalho  Remoto", ""])).toEqual([
      "casa",
      "trabalho remoto",
    ]);
  });
});

describe("recorrência", () => {
  const rule = (
    frequency: TaskRecurrence["frequency"],
    interval = 1,
    weekdays: number[] = [],
  ): TaskRecurrence => ({ frequency, interval, weekdays });

  // Mesmos casos de `src-tauri/src/domain/task_recurrence.rs`.
  it("calcula a próxima ocorrência como o backend", () => {
    expect(nextOccurrence(rule("daily"), TODAY, TODAY)).toBe("2026-09-26");
    expect(nextOccurrence(rule("daily", 3), TODAY, "2026-09-01")).toBe("2026-09-28");
    expect(nextOccurrence(rule("weekly", 2), TODAY, TODAY)).toBe("2026-10-09");
    expect(nextOccurrence(rule("weekly", 1, [1, 3, 5]), "2026-09-21", "2026-09-21")).toBe(
      "2026-09-23",
    );
    expect(nextOccurrence(rule("weekly", 1, [1, 3, 5]), TODAY, TODAY)).toBe("2026-09-28");
    expect(nextOccurrence(rule("weekly", 2, [2]), "2026-09-22", "2026-09-22")).toBe("2026-10-06");
    expect(nextOccurrence(rule("monthly"), "2026-01-31", "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence(rule("monthly"), "2026-01-31", "2026-03-01")).toBe("2026-03-31");
    expect(nextOccurrence(rule("yearly"), "2024-02-29", "2024-02-29")).toBe("2025-02-28");
    expect(nextOccurrence(rule("monthly", 6), TODAY, TODAY)).toBe("2027-03-25");
  });

  it("pula ocorrências já vencidas ao concluir com atraso", () => {
    expect(nextOccurrence(rule("daily"), "2026-09-15", TODAY)).toBe("2026-09-26");
    expect(nextOccurrence(rule("daily", 3), "2026-09-15", TODAY)).toBe("2026-09-27");
    expect(nextOccurrence(rule("monthly"), "2026-07-10", TODAY)).toBe("2026-10-10");
  });

  it("descreve a regra em pt-BR", () => {
    expect(describeRecurrence(rule("daily"))).toBe("Todo dia");
    expect(describeRecurrence(rule("daily", 2))).toBe("A cada 2 dias");
    expect(describeRecurrence(rule("weekly", 1, [5, 1]))).toBe("Toda semana: seg, sex");
    expect(describeRecurrence(rule("monthly", 3))).toBe("A cada 3 meses");
    expect(describeRecurrence(rule("yearly"))).toBe("Todo ano");
  });
});

describe("checklist", () => {
  it("calcula o progresso e marca itens localmente", () => {
    const tasks = [
      task({
        id: 1,
        checklist: [
          { id: 10, text: "a", done: true },
          { id: 11, text: "b", done: false },
        ],
      }),
      task({ id: 2 }),
    ];
    expect(checklistProgress(tasks[0]?.checklist ?? [])).toEqual({ done: 1, total: 2 });

    const toggled = applyChecklistToggle(tasks, 11, true);
    expect(checklistProgress(toggled[0]?.checklist ?? [])).toEqual({ done: 2, total: 2 });
    expect(toggled[1]).toBe(tasks[1]);
  });
});

describe("categorias", () => {
  const categories: TaskCategory[] = [
    { id: 1, name: "Trabalho", color: "red", taskCount: 2 },
    { id: 2, name: "Casa", color: "orange", taskCount: 0 },
  ];

  it("valida nome obrigatório e único sem diferenciar maiúsculas", () => {
    expect(validateCategoryInput({ name: "  ", color: "blue" }, categories)).toMatch(/nome/);
    expect(validateCategoryInput({ name: "trabalho", color: "blue" }, categories)).toMatch(
      /Já existe/,
    );
    // Renomear a própria categoria é permitido.
    expect(validateCategoryInput({ name: "TRABALHO", color: "blue" }, categories, 1)).toBeNull();
    expect(validateCategoryInput({ name: "Estudos", color: "blue" }, categories)).toBeNull();
  });

  it("sugere a primeira cor ainda não usada", () => {
    expect(suggestCategoryColor(categories)).toBe("amber");
    expect(suggestCategoryColor([])).toBe("red");
  });
});
