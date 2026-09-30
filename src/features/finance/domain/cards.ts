import { type FinanceAccount } from "@/features/finance/types";

/**
 * Dias da fatura de um cartão (fechamento e vencimento). A regra de em que
 * fatura cai uma cobrança fica no Rust (`domain/finance/cards.rs`).
 */

export type StatementDays =
  | { closingDay: number | null; dueDay: number | null; error: null }
  | { closingDay: null; dueDay: null; error: string };

function parseDay(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!/^\d{1,2}$/.test(trimmed)) return undefined;
  const day = Number(trimmed);
  return day >= 1 && day <= 31 ? day : undefined;
}

/** Os dois dias (1 a 31) ou nenhum; espelha `CardCycle::from_days`. */
export function parseStatementDays(closingText: string, dueText: string): StatementDays {
  const closingDay = parseDay(closingText);
  const dueDay = parseDay(dueText);
  const fail = (error: string): StatementDays => ({ closingDay: null, dueDay: null, error });
  if (closingDay === undefined || dueDay === undefined)
    return fail("Os dias de fechamento e de vencimento vão de 1 a 31.");
  if ((closingDay === null) !== (dueDay === null))
    return fail("Informe o dia de fechamento e o de vencimento, ou deixe os dois vazios.");
  return { closingDay, dueDay, error: null };
}

/** Ex.: "fecha dia 28, vence dia 5"; `null` sem os dias. */
export function describeStatementDays(
  account: Pick<FinanceAccount, "closingDay" | "dueDay">,
): string | null {
  if (account.closingDay === null || account.dueDay === null) return null;
  return `fecha dia ${account.closingDay}, vence dia ${account.dueDay}`;
}
