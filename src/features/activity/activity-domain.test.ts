import { describe, expect, it } from "vitest";

import { activityDescription, activityModule } from "@/features/activity/domain/activity";
import { formatCents } from "@/lib/format";
import { type ActivityEntry } from "@/types/activity";

/** Instante local (o texto do hábito compara o dia local da marcação). */
function localIso(day: number, hours: number): string {
  return new Date(2026, 8, day, hours, 0).toISOString();
}

describe("atividades recentes", () => {
  it("descreve cada tipo de atividade em pt-BR", () => {
    const entries: ActivityEntry[] = [
      {
        id: "task:1",
        occurredAt: localIso(25, 8),
        kind: "taskCompleted",
        taskId: 1,
        title: "Enviar relatório",
      },
      {
        id: "habit:1",
        occurredAt: localIso(24, 7),
        kind: "habitDone",
        habit: "Pular corda",
        routine: "Rotina matinal",
        date: "2026-09-24",
      },
      {
        id: "habit:2",
        occurredAt: localIso(26, 9),
        kind: "habitDone",
        habit: "Ler",
        routine: "Noite",
        date: "2026-09-24",
      },
      {
        id: "transaction:1",
        occurredAt: localIso(24, 19),
        kind: "transactionCreated",
        description: "Internet",
        transactionKind: "expense",
        amount: 9990,
      },
      {
        id: "audit:1",
        occurredAt: localIso(24, 14),
        kind: "cleanupRun",
        cancelled: false,
        removedBytes: 1536 * 1024 ** 2,
      },
      {
        id: "audit:2",
        occurredAt: localIso(23, 10),
        kind: "statementImported",
        fileName: "extrato.ofx",
        added: 1,
      },
    ];
    expect(entries.map(activityDescription)).toEqual([
      "Tarefa “Enviar relatório” concluída",
      "Hábito “Pular corda” feito (Rotina matinal)",
      "Hábito “Ler” feito (Noite, dia 24/09)",
      `Saída “Internet” de ${formatCents(9990)} registrada`,
      "Limpeza concluída: 1,5 GB liberados",
      "Extrato “extrato.ofx” importado: 1 lançamento",
    ]);
    expect(entries.map(activityModule)).toEqual([
      "productivity",
      "productivity",
      "productivity",
      "finance",
      "system",
      "finance",
    ]);
  });
});
