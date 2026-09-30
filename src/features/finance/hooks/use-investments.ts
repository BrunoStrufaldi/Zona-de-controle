import { useCallback, useMemo } from "react";

import { type DateRange } from "@/features/finance/domain/period";
import {
  type FinanceRegistry,
  registryActions,
  type RegistryActions,
} from "@/features/finance/hooks/use-finance";
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
import { type AsyncResource, useAsyncResource } from "@/hooks/use-async-resource";
import { useMutableResource } from "@/hooks/use-mutable-resource";
import { listFinanceAccounts, listFinanceCategories } from "@/services/finance-service";
import {
  createInvestmentAsset,
  createInvestmentMovement,
  deleteInvestmentAsset,
  deleteInvestmentMovement,
  deleteInvestmentValuation,
  getInvestmentAsset,
  getInvestmentsOverview,
  getInvestmentsPerformance,
  linkInvestmentTransaction,
  setInvestmentValuations,
  updateInvestmentAsset,
  updateInvestmentMovement,
} from "@/services/investments-service";
import { type IsoDate } from "@/types/common";

export interface InvestmentsData extends FinanceRegistry {
  investments: InvestmentsOverview;
}

export interface InvestmentsActions extends RegistryActions {
  /** Cria (`id` nulo) ou edita um ativo. */
  saveAsset: (id: number | null, input: AssetInput) => Promise<InvestmentAsset>;
  /** Exclusão definitiva — chame apenas após confirmação do usuário. */
  removeAsset: (id: number) => Promise<void>;
  /** Registra (`id` nulo, no ativo `assetId`) ou edita uma movimentação. */
  saveMovement: (
    assetId: number,
    id: number | null,
    input: MovementInput,
  ) => Promise<InvestmentMovement>;
  /** Exclusão definitiva — chame apenas após confirmação do usuário. */
  removeMovement: (id: number) => Promise<void>;
  /** Cria a movimentação a partir de uma transferência já existente. */
  link: (
    assetId: number,
    transactionId: number,
    quantity: Quantity | null,
  ) => Promise<InvestmentMovement>;
  setValuations: (valuations: ValuationInput[]) => Promise<void>;
  /** Exclusão definitiva — chame apenas após confirmação do usuário. */
  removeValuation: (assetId: number, date: IsoDate) => Promise<void>;
  /** Histórico completo de um ativo (não altera nada). */
  loadAsset: (id: number) => Promise<AssetDetail>;
}

function loadInvestments(): Promise<InvestmentsData> {
  return Promise.all([
    getInvestmentsOverview(),
    listFinanceAccounts(),
    listFinanceCategories(),
  ]).then(([investments, accounts, categories]) => ({ investments, accounts, categories }));
}

/** Carteira com contas e categorias. Tudo é recarregado após cada operação. */
export function useInvestments(): {
  resource: AsyncResource<InvestmentsData>;
  actions: InvestmentsActions;
} {
  const { resource, mutate } = useMutableResource(loadInvestments);

  const actions = useMemo<InvestmentsActions>(
    () => ({
      ...registryActions(mutate),
      saveAsset: (id, input) =>
        mutate(null, () =>
          id === null ? createInvestmentAsset(input) : updateInvestmentAsset(id, input),
        ),
      removeAsset: (id) =>
        mutate(
          (data) => ({
            ...data,
            investments: {
              ...data.investments,
              assets: data.investments.assets.filter((asset) => asset.id !== id),
            },
          }),
          () => deleteInvestmentAsset(id),
        ),
      saveMovement: (assetId, id, input) =>
        mutate(null, () =>
          id === null
            ? createInvestmentMovement(assetId, input)
            : updateInvestmentMovement(id, input),
        ),
      removeMovement: (id) => mutate(null, () => deleteInvestmentMovement(id)),
      link: (assetId, transactionId, quantity) =>
        mutate(null, () => linkInvestmentTransaction(assetId, transactionId, quantity)),
      setValuations: (valuations) => mutate(null, () => setInvestmentValuations(valuations)),
      removeValuation: (assetId, date) =>
        mutate(null, () => deleteInvestmentValuation(assetId, date)),
      loadAsset: getInvestmentAsset,
    }),
    [mutate],
  );

  return { resource, actions };
}

/** Desempenho do período (somente leitura); trocar o período mantém os dados na tela até a nova leitura. */
export function useInvestmentsPerformance(range: DateRange): AsyncResource<InvestmentsPerformance> {
  const { from, to } = range;
  const load = useCallback(() => getInvestmentsPerformance(from, to), [from, to]);
  return useAsyncResource(load);
}
