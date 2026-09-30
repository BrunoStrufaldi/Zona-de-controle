import {
  type AssetDetail,
  type AssetInput,
  type InvestmentAsset,
  type InvestmentMovement,
  type InvestmentsOverview,
  type InvestmentsPerformance,
  type MovementInput,
  type Quantity,
  type ValuationInput,
} from "@/features/finance/types";
import { invokeCommand } from "@/services/tauri/commands";
import { type IsoDate } from "@/types/common";

/**
 * Carteira (posição de cada ativo calculada no Rust), o dinheiro fora dela nas
 * contas de investimentos, o patrimônio e as transferências ainda sem ativo.
 */
export function getInvestmentsOverview(): Promise<InvestmentsOverview> {
  return invokeCommand("get_investments_overview");
}

/**
 * Resultado e rentabilidade de `from` a `to` (inclusive), evolução mensal da
 * carteira e vencimentos da renda fixa, calculados no Rust.
 */
export function getInvestmentsPerformance(
  from: IsoDate,
  to: IsoDate,
): Promise<InvestmentsPerformance> {
  return invokeCommand("get_investments_performance", { from, to });
}

/** Um ativo com todas as movimentações e valores informados. */
export function getInvestmentAsset(id: number): Promise<AssetDetail> {
  return invokeCommand("get_investment_asset", { id });
}

export function createInvestmentAsset(input: AssetInput): Promise<InvestmentAsset> {
  return invokeCommand("create_investment_asset", { input });
}

export function updateInvestmentAsset(id: number, input: AssetInput): Promise<InvestmentAsset> {
  return invokeCommand("update_investment_asset", { id, input });
}

/**
 * Exclusão definitiva e auditada do ativo com o histórico (os lançamentos
 * vinculados continuam). Só chame após confirmação explícita do usuário.
 */
export async function deleteInvestmentAsset(id: number): Promise<void> {
  await invokeCommand("delete_investment_asset", { id });
}

/** Registra aplicação, resgate ou provento (com a conta, cria e vincula o lançamento). */
export function createInvestmentMovement(
  assetId: number,
  input: MovementInput,
): Promise<InvestmentMovement> {
  return invokeCommand("create_investment_movement", { assetId, input });
}

export function updateInvestmentMovement(
  id: number,
  input: MovementInput,
): Promise<InvestmentMovement> {
  return invokeCommand("update_investment_movement", { id, input });
}

/**
 * Exclusão definitiva e auditada da movimentação (o lançamento vinculado
 * continua). Só chame após confirmação explícita do usuário.
 */
export async function deleteInvestmentMovement(id: number): Promise<void> {
  await invokeCommand("delete_investment_movement", { id });
}

/** Cria a movimentação a partir de um lançamento existente (ex.: importado do extrato). */
export function linkInvestmentTransaction(
  assetId: number,
  transactionId: number,
  quantity: Quantity | null,
): Promise<InvestmentMovement> {
  return invokeCommand("link_investment_transaction", { assetId, transactionId, quantity });
}

/** Grava os valores atuais informados (um por ativo e dia). */
export async function setInvestmentValuations(valuations: ValuationInput[]): Promise<void> {
  await invokeCommand("set_investment_valuations", { valuations });
}

/**
 * Exclusão definitiva e auditada de um valor informado. Só chame após
 * confirmação explícita do usuário.
 */
export async function deleteInvestmentValuation(assetId: number, date: IsoDate): Promise<void> {
  await invokeCommand("delete_investment_valuation", { assetId, date });
}
