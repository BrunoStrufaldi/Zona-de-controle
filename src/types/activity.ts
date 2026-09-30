import { type IsoDate, type IsoDateTime } from "@/types/common";

/**
 * Entrada do feed de atividades recentes (dashboard). Espelha
 * `src-tauri/src/domain/activity.rs`: o Rust junta o que os módulos já guardam
 * (nada é gravado para o feed) e os textos ficam em
 * `src/features/activity/domain/activity.ts`.
 */
export type ActivityDetail =
  | { kind: "taskCompleted"; taskId: number; title: string }
  | { kind: "habitDone"; habit: string; routine: string; date: IsoDate }
  | {
      kind: "transactionCreated";
      description: string;
      transactionKind: "income" | "expense" | "transfer";
      /** Centavos, sempre positivo. */
      amount: number;
    }
  | { kind: "cleanupRun"; cancelled: boolean; removedBytes: number }
  | { kind: "statementImported"; fileName: string; added: number };

export type ActivityEntry = ActivityDetail & {
  /** Único no feed (ex.: "task:12"). */
  id: string;
  occurredAt: IsoDateTime;
};

export type ActivityModule = "productivity" | "system" | "finance";
