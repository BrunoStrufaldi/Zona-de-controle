import { type TaskPriority, type TaskStatus } from "@/features/productivity/tasks/types";

export const statusLabels: Record<TaskStatus, string> = {
  todo: "A fazer",
  in_progress: "Fazendo",
  done: "Feito",
};

export const priorityLabels: Record<TaskPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

/** Peso para ordenação (maior = mais importante). */
export const priorityRank: Record<TaskPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};
