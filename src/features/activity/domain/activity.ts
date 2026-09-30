import { formatBytes, formatCents, formatDayMonth, formatNumber } from "@/lib/format";
import { toIsoDate } from "@/lib/dates";
import { type ActivityEntry, type ActivityModule } from "@/types/activity";

/** Atividades mostradas no card do dashboard. */
export const RECENT_ACTIVITY_LIMIT = 5;

export function activityModule(entry: ActivityEntry): ActivityModule {
  switch (entry.kind) {
    case "taskCompleted":
    case "habitDone":
      return "productivity";
    case "transactionCreated":
    case "statementImported":
      return "finance";
    case "cleanupRun":
      return "system";
  }
}

const TRANSACTION_LABELS = {
  income: "Entrada",
  expense: "Saída",
  transfer: "Transferência",
} as const;

/** Texto da atividade em pt-BR. */
export function activityDescription(entry: ActivityEntry): string {
  switch (entry.kind) {
    case "taskCompleted":
      return `Tarefa “${entry.title}” concluída`;
    case "habitDone": {
      // Marcado depois (até 7 dias atrás): diz de que dia era.
      const markedOn = toIsoDate(new Date(entry.occurredAt));
      const day = entry.date === markedOn ? "" : `, dia ${formatDayMonth(entry.date)}`;
      return `Hábito “${entry.habit}” feito (${entry.routine}${day})`;
    }
    case "transactionCreated":
      return `${TRANSACTION_LABELS[entry.transactionKind]} “${entry.description}” de ${formatCents(entry.amount)} registrada`;
    case "cleanupRun":
      return `Limpeza ${entry.cancelled ? "cancelada" : "concluída"}: ${formatBytes(entry.removedBytes)} liberados`;
    case "statementImported":
      return `Extrato “${entry.fileName}” importado: ${formatNumber(entry.added, 0)} ${entry.added === 1 ? "lançamento" : "lançamentos"}`;
  }
}
