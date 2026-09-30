import {
  type AccountKind,
  type FinanceAccount,
  type ImportCommitInput,
  type ImportFormat,
  type ImportPreview,
  type OccurrenceRef,
  type PreviewLine,
  type SuggestionReason,
  type TransactionKind,
} from "@/features/finance/types";
import { occurrenceKey } from "@/features/finance/domain/recurring";
import { type IsoDate } from "@/types/common";

/** Espelha `MAX_FILE_BYTES` no Rust. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export const importFormatLabels: Record<ImportFormat, string> = {
  ofx: "Extrato em OFX",
  c6_card_csv: "Fatura do cartão C6 (CSV)",
};

export const reasonLabels: Record<SuggestionReason, string> = {
  duplicate: "Já importado antes",
  bill_payment: "Pagamento da fatura anterior: fica registrado pela conta corrente",
  learned_rule: "Sugerido pelas suas escolhas anteriores",
  card_payment: "Pagamento de fatura: transferência para o cartão",
  investment: "Aplicação ou resgate: transferência com os investimentos",
  recurring: "Vencimento de recorrente",
};

/** Escolha da tela para uma linha do arquivo. */
export interface LineChoice {
  include: boolean;
  kind: TransactionKind;
  categoryId: number | null;
  counterpartAccountId: number | null;
  /** Vencimento de recorrente a vincular (só entrada/saída). */
  recurring: OccurrenceRef | null;
}

export type ImportChoices = Readonly<Record<number, LineChoice>>;

/** Começa pelas sugestões do Rust (duplicados nunca entram). */
export function initialChoices(preview: ImportPreview): ImportChoices {
  return Object.fromEntries(
    preview.lines.map((line) => [
      line.index,
      {
        include: line.suggestion.include && !line.duplicate,
        kind: line.suggestion.kind,
        categoryId: line.suggestion.categoryId,
        counterpartAccountId: line.suggestion.counterpartAccountId,
        recurring: line.suggestion.recurring,
      },
    ]),
  );
}

/** Uma entrada só pode ser entrada ou transferência; uma saída, saída ou transferência. */
export function kindOptions(line: Pick<PreviewLine, "inflow">): TransactionKind[] {
  return line.inflow ? ["income", "transfer"] : ["expense", "transfer"];
}

/**
 * Troca o tipo limpando o que não vale mais (categoria, conta da transferência
 * e o vínculo com a recorrente, que é só de entradas e saídas).
 */
export function changeLineKind(choice: LineChoice, kind: TransactionKind): LineChoice {
  if (kind === choice.kind) return choice;
  return {
    ...choice,
    kind,
    categoryId: null,
    counterpartAccountId: kind === "transfer" ? choice.counterpartAccountId : null,
    recurring: null,
  };
}

/**
 * Vincula a linha a um vencimento (ou desfaz, com `null`). Sem categoria
 * escolhida, a linha fica com a categoria da recorrente.
 */
export function chooseRecurring(
  line: Pick<PreviewLine, "recurringCandidates">,
  choice: LineChoice,
  occurrence: OccurrenceRef | null,
): LineChoice {
  const candidate = line.recurringCandidates.find(
    (item) =>
      item.recurringId === occurrence?.recurringId &&
      item.occurrenceDate === occurrence.occurrenceDate,
  );
  if (!candidate) return { ...choice, recurring: null };
  return {
    ...choice,
    recurring: { recurringId: candidate.recurringId, occurrenceDate: candidate.occurrenceDate },
    categoryId: choice.categoryId ?? candidate.categoryId,
  };
}

/**
 * Escolhe a categoria de uma linha e aplica a mesma às linhas parecidas (mesma
 * descrição ou mesma categoria do banco) que ainda estão sem categoria, marcadas
 * e do mesmo tipo. Escolhas já feitas nunca são trocadas. Retorna quantas
 * linhas além da escolhida mudaram.
 */
export function applyCategory(
  preview: ImportPreview,
  choices: ImportChoices,
  index: number,
  categoryId: number | null,
): { choices: ImportChoices; alsoApplied: number } {
  const source = preview.lines.find((line) => line.index === index);
  const chosen = choices[index];
  if (!source || !chosen) return { choices, alsoApplied: 0 };

  const next: Record<number, LineChoice> = { ...choices, [index]: { ...chosen, categoryId } };
  let alsoApplied = 0;
  if (categoryId !== null) {
    for (const line of preview.lines) {
      const choice = next[line.index];
      const similar =
        (source.descriptionKey !== null && line.descriptionKey === source.descriptionKey) ||
        (source.sourceCategory !== null && line.sourceCategory === source.sourceCategory);
      if (
        line.index === index ||
        line.duplicate ||
        !similar ||
        !choice?.include ||
        choice.kind !== chosen.kind ||
        choice.categoryId !== null
      )
        continue;
      next[line.index] = { ...choice, categoryId };
      alsoApplied += 1;
    }
  }
  return { choices: next, alsoApplied };
}

/** Conta sugerida: a primeira do tipo do arquivo, ou a única conta que houver. */
export function pickAccount(
  accounts: readonly FinanceAccount[],
  kind: AccountKind | null,
): number | null {
  const ofKind = accounts.find((account) => account.kind === kind);
  if (ofKind) return ofKind.id;
  return accounts.length === 1 ? (accounts[0]?.id ?? null) : null;
}

export interface ImportCounts {
  /** Marcadas para importar. */
  selected: number;
  duplicates: number;
  /** Não duplicadas e desmarcadas. */
  left: number;
  /** Marcadas e vinculadas a um vencimento de recorrente. */
  linked: number;
}

export function countChoices(preview: ImportPreview, choices: ImportChoices): ImportCounts {
  let selected = 0;
  let duplicates = 0;
  let linked = 0;
  for (const line of preview.lines) {
    const choice = choices[line.index];
    if (line.duplicate) duplicates += 1;
    else if (choice?.include) {
      selected += 1;
      if (choice.recurring !== null && choice.kind !== "transfer") linked += 1;
    }
  }
  return { selected, duplicates, left: preview.lines.length - selected - duplicates, linked };
}

/**
 * Monta o pedido de importação ou diz o que falta. Valores e datas não vão:
 * o Rust usa a própria leitura do arquivo.
 */
export function buildCommit(
  preview: ImportPreview,
  choices: ImportChoices,
  accountId: number | null,
  statementDate: IsoDate | null,
): { input: ImportCommitInput | null; problem: string | null } {
  const fail = (problem: string) => ({ input: null, problem });
  if (accountId === null) return fail("Escolha a conta do arquivo.");
  if (preview.format === "c6_card_csv" && !statementDate)
    return fail("Informe o vencimento da fatura.");

  const lines = preview.lines
    .filter((line) => !line.duplicate && choices[line.index]?.include)
    .map((line) => {
      const choice = choices[line.index] as LineChoice;
      return {
        index: line.index,
        kind: choice.kind,
        categoryId: choice.kind === "transfer" ? null : choice.categoryId,
        counterpartAccountId: choice.kind === "transfer" ? choice.counterpartAccountId : null,
        recurring: choice.kind === "transfer" ? null : choice.recurring,
      };
    });
  if (lines.length === 0) return fail("Marque ao menos um lançamento.");
  const linked = lines.flatMap((line) => (line.recurring ? [occurrenceKey(line.recurring)] : []));
  if (new Set(linked).size !== linked.length)
    return fail("O mesmo vencimento de recorrente foi escolhido para duas linhas.");
  const badTransfer = lines.find(
    (line) =>
      line.kind === "transfer" &&
      (line.counterpartAccountId === null || line.counterpartAccountId === accountId),
  );
  if (badTransfer)
    return fail(
      "Nas transferências marcadas, escolha a outra conta (diferente da conta do arquivo).",
    );

  return {
    input: {
      previewId: preview.previewId,
      accountId,
      statementDate: preview.format === "c6_card_csv" ? statementDate : null,
      lines,
    },
    problem: null,
  };
}
