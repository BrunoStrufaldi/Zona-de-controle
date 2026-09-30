import {
  Archive,
  Coins,
  Landmark,
  Plus,
  RefreshCw,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { WidgetCard } from "@/components/shared/widget-card";
import { Button } from "@/components/ui/button";
import { AllocationCard } from "@/features/finance/components/allocation-card";
import { type AssetActions, AssetGroup } from "@/features/finance/components/asset-list";
import { InvestmentsMetrics } from "@/features/finance/components/investments-metrics";
import { NetWorthCard } from "@/features/finance/components/net-worth-card";
import { UnlinkedTransfersCard } from "@/features/finance/components/unlinked-transfers-card";
import { indexById } from "@/features/finance/domain/filters";
import {
  assetClassLabels,
  groupByClass,
  isInvestmentAccount,
} from "@/features/finance/domain/investments";
import { type InvestmentsData } from "@/features/finance/hooks/use-investments";
import { type UnlinkedTransfer } from "@/features/finance/types";

interface InvestmentsViewProps extends AssetActions {
  data: InvestmentsData;
  onCreateAccount: () => void;
  onCreateAsset: () => void;
  onUpdateValues: () => void;
  onLinkTransfer: (transfer: UnlinkedTransfer) => void;
}

export function InvestmentsView({
  data,
  onCreateAccount,
  onCreateAsset,
  onUpdateValues,
  onLinkTransfer,
  ...actions
}: InvestmentsViewProps) {
  const { investments } = data;
  const accounts = indexById(data.accounts);
  const groups = groupByClass(investments.assets);
  const closed = investments.assets.filter((asset) => asset.position.closed);

  if (!data.accounts.some(isInvestmentAccount)) {
    return (
      <EmptyState
        icon={Landmark}
        title="Crie uma conta de investimentos"
        description="Os ativos ficam numa conta do tipo Investimentos (ex.: “Investimentos C6”). As aplicações e os resgates são transferências entre ela e a sua conta corrente."
        action={
          <Button onClick={onCreateAccount}>
            <Plus aria-hidden="true" />
            Criar conta de investimentos
          </Button>
        }
        className="py-16"
      />
    );
  }

  if (investments.assets.length === 0 && investments.unlinked.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Nenhum ativo ainda"
        description="Cadastre seus investimentos (CDB, Tesouro, ações…) e informe o valor atual de cada um, copiado do app do banco. O app não baixa cotações."
        action={
          <Button onClick={onCreateAsset}>
            <Plus aria-hidden="true" />
            Novo ativo
          </Button>
        }
        className="py-16"
      />
    );
  }

  return (
    <div className="@container">
      <div className="grid gap-6">
        <WidgetCard title="Resumo" icon={Wallet}>
          <InvestmentsMetrics investments={investments} />
          {investments.staleCount > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
              <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
              <span className="flex-1">
                {investments.staleCount === 1
                  ? "1 ativo está com o valor desatualizado ou não informado."
                  : `${investments.staleCount} ativos estão com o valor desatualizado ou não informado.`}
              </span>
              <Button size="sm" variant="secondary" onClick={onUpdateValues}>
                <RefreshCw aria-hidden="true" />
                Atualizar valores
              </Button>
            </div>
          )}
        </WidgetCard>

        {investments.unlinked.length > 0 && (
          <UnlinkedTransfersCard
            transfers={investments.unlinked}
            accounts={accounts}
            onLink={onLinkTransfer}
          />
        )}

        <div className="grid gap-6 @5xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <WidgetCard title="Ativos" icon={Coins}>
            {groups.length === 0 ? (
              <EmptyState
                icon={Coins}
                title="Nenhum ativo em aberto"
                className="border-0 py-6"
                action={
                  <Button size="sm" variant="secondary" onClick={onCreateAsset}>
                    <Plus aria-hidden="true" />
                    Novo ativo
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-5">
                {groups.map((group) => (
                  <AssetGroup
                    key={group.assetClass}
                    assetClass={group.assetClass}
                    assets={group.assets}
                    accounts={accounts}
                    label={`Ativos de ${assetClassLabels[group.assetClass]}`}
                    {...actions}
                  />
                ))}
              </div>
            )}
          </WidgetCard>

          <div className="grid content-start gap-6">
            <AllocationCard shares={investments.byClass} />
            <NetWorthCard investments={investments} accounts={accounts} />
          </div>
        </div>

        {closed.length > 0 && (
          <WidgetCard title="Encerrados" icon={Archive}>
            <AssetGroup
              assetClass={null}
              assets={closed}
              accounts={accounts}
              label="Ativos encerrados"
              {...actions}
            />
          </WidgetCard>
        )}
      </div>
    </div>
  );
}
