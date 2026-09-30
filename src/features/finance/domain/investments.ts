import { MAX_AMOUNT_CENTS, parseAmount, toAmountInput } from "@/features/finance/domain/money";
import {
  ASSET_CLASSES,
  type AssetClass,
  type AssetInput,
  type CategoryColor,
  type Cents,
  type InvestmentAsset,
  type InvestmentMovement,
  type MovementInput,
  type MovementKind,
  type Position,
  type Quantity,
  type ValuationInput,
} from "@/features/finance/types";
import { formatCents, formatDate, formatNumber, formatPercent } from "@/lib/format";
import { type IsoDate } from "@/types/common";

/** Limites espelhados de `src-tauri/src/domain/finance/investments.rs`. */
export const INVESTMENT_LIMITS = {
  nameChars: 60,
  tickerChars: 20,
  assetNotesChars: 2_000,
  movementNotesChars: 500,
} as const;

/** Quantidades vêm em 1e-8 unidade (1 cota = `QUANTITY_SCALE`). */
export const QUANTITY_SCALE = 100_000_000;
const MAX_QUANTITY_DIGITS = 8;
/** Até 10 bilhões de unidades, como no Rust. */
const MAX_QUANTITY: Quantity = 10_000_000_000 * QUANTITY_SCALE;

export const assetClassLabels: Record<AssetClass, string> = {
  fixed_income: "Renda fixa",
  stocks: "Ações",
  reits: "FIIs",
  etfs: "ETFs",
  crypto: "Cripto",
  other: "Outros",
};

/** Exemplos no formulário do ativo. */
export const assetClassHints: Record<AssetClass, string> = {
  fixed_income: "Ex.: CDB C6 110% CDI",
  stocks: "Ex.: Itaúsa",
  reits: "Ex.: HGLG11",
  etfs: "Ex.: BOVA11",
  crypto: "Ex.: Bitcoin",
  other: "Ex.: Previdência",
};

/** Cor de cada classe (nomes da paleta; ver `src/lib/palette.ts`). */
export const assetClassColors: Record<AssetClass, CategoryColor> = {
  fixed_income: "blue",
  stocks: "violet",
  reits: "amber",
  etfs: "teal",
  crypto: "orange",
  other: "slate",
};

export const movementKindLabels: Record<MovementKind, string> = {
  contribution: "Aplicação",
  withdrawal: "Resgate",
  income: "Provento",
};

/** Mensagem de sucesso ao registrar. */
export const movementRegisteredLabels: Record<MovementKind, string> = {
  contribution: "Aplicação registrada",
  withdrawal: "Resgate registrado",
  income: "Provento registrado",
};

/** Com quantidade (cotas, ações, unidades) faz sentido informar preço médio. */
export function tracksQuantity(assetClass: AssetClass): boolean {
  return assetClass !== "fixed_income" && assetClass !== "other";
}

// ---------------------------------------------------------------- Quantidade

/**
 * Converte a quantidade digitada em 1e-8 unidade. Aceita vírgula decimal
 * ("0,5", "1.234,5") ou ponto decimal ("0.00012345"), com até 8 casas.
 * Retorna `null` quando inválida ou zero.
 */
export function parseQuantity(text: string): Quantity | null {
  let value = text.trim().replace(/\s/g, "");
  if (value === "") return null;
  if (value.includes(",")) {
    if (!/^\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^\d+(?:,\d+)?$/.test(value)) return null;
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) {
    value = value.replace(/\./g, "");
  }
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return null;
  const [, whole = "0", fraction = ""] = match;
  if (fraction.length > MAX_QUANTITY_DIGITS) return null;
  const quantity =
    Number(whole) * QUANTITY_SCALE + Number(fraction.padEnd(MAX_QUANTITY_DIGITS, "0"));
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) return null;
  return quantity;
}

/** 1e-8 unidade → "1.234,5" (até 8 casas, sem zeros à direita). */
export function formatQuantity(quantity: Quantity): string {
  return formatNumber(quantity / QUANTITY_SCALE, MAX_QUANTITY_DIGITS);
}

/** Para edição no campo: 150000000 → "1,5". */
export function toQuantityInput(quantity: Quantity): string {
  const whole = Math.floor(quantity / QUANTITY_SCALE);
  const fraction = String(quantity % QUANTITY_SCALE)
    .padStart(MAX_QUANTITY_DIGITS, "0")
    .replace(/0+$/, "");
  return fraction === "" ? String(whole) : `${whole},${fraction}`;
}

// ---------------------------------------------------------------- Posição

/** De onde vem o valor atual, para exibir abaixo dele. */
export function valueStatusText(position: Position): string {
  const date = position.valuedOn ? formatDate(position.valuedOn) : null;
  switch (position.valueStatus) {
    case "informed":
      return `Informado em ${date ?? "—"}`;
    case "adjusted":
      return `Informado em ${date ?? "—"} + movimentações depois`;
    case "not_informed":
      return "Valor não informado: considera o aplicado";
  }
}

/** Resultado com sinal: "+R$ 900,00", "−R$ 50,00" (zero sem sinal). */
export function formatGain(cents: Cents): string {
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
  return `${sign}${formatCents(Math.abs(cents))}`;
}

/** Percentual com sinal: "+0,9%", "−5%" (zero sem sinal). */
export function formatGainRate(rate: number): string {
  const sign = rate > 0 ? "+" : rate < 0 ? "−" : "";
  return `${sign}${formatPercent(Math.abs(rate))}`;
}

/** Resultado com o percentual sobre o aplicado: "+R$ 900,00 (+0,9%)". */
export function formatGainWithRate(position: Pick<Position, "gain" | "gainRate">): string {
  const rate = position.gainRate;
  if (rate === null) return formatGain(position.gain);
  return `${formatGain(position.gain)} (${formatGainRate(rate)})`;
}

/**
 * A movimentação é de antes (ou do dia) do último valor informado do ativo,
 * que já deveria incluí-la: vincular depois muda o resultado.
 */
export function predatesValuation(position: Pick<Position, "valuedOn">, date: IsoDate): boolean {
  return position.valuedOn !== null && date <= position.valuedOn;
}

/** Ativos em aberto por classe, na ordem das classes (a ordem do Rust dentro de cada uma). */
export function groupByClass(
  assets: readonly InvestmentAsset[],
): { assetClass: AssetClass; assets: InvestmentAsset[] }[] {
  const open = assets.filter((asset) => !asset.position.closed);
  return ASSET_CLASSES.map((assetClass) => ({
    assetClass,
    assets: open.filter((asset) => asset.class === assetClass),
  })).filter((group) => group.assets.length > 0);
}

/** Contas do tipo Investimentos (onde os ativos ficam). */
export function isInvestmentAccount(account: { kind: string }): boolean {
  return account.kind === "investment";
}

// ---------------------------------------------------------------- Formulário do ativo

export interface AssetDraft {
  accountId: number | null;
  class: AssetClass;
  name: string;
  ticker: string;
  maturityDate: string;
  notes: string;
}

export type AssetDraftErrors = Partial<Record<keyof AssetDraft, string>>;

export function emptyAssetDraft(accountId: number | null): AssetDraft {
  return { accountId, class: "fixed_income", name: "", ticker: "", maturityDate: "", notes: "" };
}

export function toAssetDraft(asset: InvestmentAsset): AssetDraft {
  return {
    accountId: asset.accountId,
    class: asset.class,
    name: asset.name,
    ticker: asset.ticker ?? "",
    maturityDate: asset.maturityDate ?? "",
    notes: asset.notes,
  };
}

export function validateAssetDraft(draft: AssetDraft): {
  input: AssetInput | null;
  errors: AssetDraftErrors;
} {
  const errors: AssetDraftErrors = {};
  const name = draft.name.trim().replace(/\s+/g, " ");
  if (name === "") errors.name = "Informe o nome do ativo.";
  else if (name.length > INVESTMENT_LIMITS.nameChars)
    errors.name = `Use no máximo ${INVESTMENT_LIMITS.nameChars} caracteres.`;
  if (draft.accountId === null) errors.accountId = "Escolha a conta de investimentos.";
  const ticker = draft.ticker.trim().toUpperCase();
  if (/\s/.test(ticker) || ticker.length > INVESTMENT_LIMITS.tickerChars)
    errors.ticker = `Até ${INVESTMENT_LIMITS.tickerChars} caracteres, sem espaços.`;
  const fixedIncome = draft.class === "fixed_income";
  if (draft.notes.length > INVESTMENT_LIMITS.assetNotesChars)
    errors.notes = `Use no máximo ${INVESTMENT_LIMITS.assetNotesChars} caracteres.`;

  if (Object.keys(errors).length > 0 || draft.accountId === null) return { input: null, errors };
  return {
    input: {
      accountId: draft.accountId,
      class: draft.class,
      name,
      ticker: ticker === "" ? null : ticker,
      maturityDate: fixedIncome && draft.maturityDate !== "" ? draft.maturityDate : null,
      notes: draft.notes.trim(),
    },
    errors,
  };
}

// ---------------------------------------------------------------- Formulário da movimentação

export interface MovementDraft {
  kind: MovementKind;
  date: IsoDate;
  amountText: string;
  quantityText: string;
  notes: string;
  /** Conta de onde sai (ou para onde vai) o dinheiro; `null` = sem lançamento. */
  accountId: number | null;
  closesPosition: boolean;
}

export type MovementDraftErrors = Partial<Record<keyof MovementDraft, string>>;

export function emptyMovementDraft(
  kind: MovementKind,
  date: IsoDate,
  accountId: number | null,
): MovementDraft {
  return {
    kind,
    date,
    amountText: "",
    quantityText: "",
    notes: "",
    accountId,
    closesPosition: false,
  };
}

export function toMovementDraft(movement: InvestmentMovement): MovementDraft {
  return {
    kind: movement.kind,
    date: movement.date,
    amountText: toAmountInput(movement.amount),
    quantityText: movement.quantity === null ? "" : toQuantityInput(movement.quantity),
    notes: movement.notes,
    accountId: null,
    closesPosition: false,
  };
}

export function validateMovementDraft(draft: MovementDraft): {
  input: MovementInput | null;
  errors: MovementDraftErrors;
} {
  const errors: MovementDraftErrors = {};
  const amount = parseAmount(draft.amountText);
  if (amount === null || amount <= 0) errors.amountText = "Informe um valor maior que zero.";
  else if (amount > MAX_AMOUNT_CENTS) errors.amountText = "O valor está acima do limite aceito.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) errors.date = "Informe a data.";
  const income = draft.kind === "income";
  const quantity = income ? null : parseQuantity(draft.quantityText);
  if (!income && draft.quantityText.trim() !== "" && quantity === null)
    errors.quantityText = "Quantidade inválida (até 8 casas decimais).";
  if (draft.notes.length > INVESTMENT_LIMITS.movementNotesChars)
    errors.notes = `Use no máximo ${INVESTMENT_LIMITS.movementNotesChars} caracteres.`;

  if (Object.keys(errors).length > 0 || amount === null) return { input: null, errors };
  return {
    input: {
      kind: draft.kind,
      date: draft.date,
      amount,
      quantity,
      notes: draft.notes.trim(),
      accountId: draft.accountId,
      closesPosition: draft.kind === "withdrawal" && draft.closesPosition,
    },
    errors,
  };
}

// ---------------------------------------------------------------- Atualizar valores

/** Linha do formulário "Atualizar valores": o texto começa vazio. */
export interface ValuationDraft {
  assetId: number;
  valueText: string;
}

/**
 * Valores preenchidos → entradas para o Rust (linhas vazias ficam de fora).
 * `errors` indica as linhas com texto inválido, por id do ativo.
 */
export function validateValuations(
  drafts: readonly ValuationDraft[],
  date: IsoDate,
): { inputs: ValuationInput[]; errors: Map<number, string> } {
  const inputs: ValuationInput[] = [];
  const errors = new Map<number, string>();
  for (const draft of drafts) {
    const text = draft.valueText.trim();
    if (text === "") continue;
    const value = parseAmount(text);
    if (value === null || value > MAX_AMOUNT_CENTS) {
      errors.set(draft.assetId, "Valor inválido.");
      continue;
    }
    inputs.push({ assetId: draft.assetId, date, value });
  }
  return { inputs, errors };
}
