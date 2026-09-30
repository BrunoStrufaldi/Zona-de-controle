import { Plus, RefreshCw, TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { ResourceView } from "@/components/shared/resource-view";
import { Button } from "@/components/ui/button";
import { AccountsDialog } from "@/features/finance/components/accounts-dialog";
import { AssetDetailDialog } from "@/features/finance/components/asset-detail-dialog";
import {
  AssetFormDialog,
  type AssetFormMode,
} from "@/features/finance/components/asset-form-dialog";
import { ConfirmDeleteDialog } from "@/features/finance/components/confirm-delete-dialog";
import { InvestmentsView } from "@/features/finance/components/investments-view";
import { LinkAssetDialog } from "@/features/finance/components/link-asset-dialog";
import {
  MovementFormDialog,
  type MovementFormMode,
} from "@/features/finance/components/movement-form-dialog";
import {
  ValuationsDialog,
  type ValuationsTarget,
} from "@/features/finance/components/valuations-dialog";
import { indexById } from "@/features/finance/domain/filters";
import {
  isInvestmentAccount,
  movementKindLabels,
  movementRegisteredLabels,
} from "@/features/finance/domain/investments";
import { useInvestments } from "@/features/finance/hooks/use-investments";
import {
  type InvestmentAsset,
  type InvestmentMovement,
  type UnlinkedTransfer,
  type Valuation,
} from "@/features/finance/types";
import { toIsoDate } from "@/lib/dates";
import { formatCents, formatDate } from "@/lib/format";
import { toServiceError } from "@/services/tauri/errors";

function notifyError(title: string, error: unknown) {
  toast.error(title, { description: toServiceError(error).message });
}

export function InvestmentsPage() {
  const today = toIsoDate(new Date());
  const { resource, actions } = useInvestments();
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [assetForm, setAssetForm] = useState<AssetFormMode | null>(null);
  /** Transferência à espera do ativo que está sendo cadastrado para ela. */
  const [pendingLink, setPendingLink] = useState<UnlinkedTransfer | null>(null);
  const [movementForm, setMovementForm] = useState<MovementFormMode | null>(null);
  const [valuations, setValuations] = useState<ValuationsTarget | null>(null);
  const [detail, setDetail] = useState<InvestmentAsset | null>(null);
  const [detailVersion, setDetailVersion] = useState(0);
  const [linking, setLinking] = useState<UnlinkedTransfer | null>(null);
  const [deletingAsset, setDeletingAsset] = useState<InvestmentAsset | null>(null);
  const [deletingMovement, setDeletingMovement] = useState<{
    asset: InvestmentAsset;
    movement: InvestmentMovement;
  } | null>(null);
  const [deletingValuation, setDeletingValuation] = useState<{
    asset: InvestmentAsset;
    valuation: Valuation;
  } | null>(null);

  const loaded = resource.status === "success" ? resource.data : null;
  const investmentAccounts = (loaded?.accounts ?? []).filter(isInvestmentAccount);
  const openAssets = (loaded?.investments.assets ?? []).filter((asset) => !asset.position.closed);
  const accountNames = indexById(loaded?.accounts ?? []);
  const changed = () => {
    setDetailVersion((version) => version + 1);
  };

  const openCreateAsset = () => {
    setAssetForm({ kind: "create", accountId: null });
  };
  const openUpdateValues = () => {
    setValuations({ assets: openAssets, date: today });
  };

  return (
    <>
      <PageHeader
        title="Investimentos"
        description="Carteira, valor atual informado por você, resultado e patrimônio. Nenhuma cotação é baixada da internet."
        icon={TrendingUp}
        actions={
          investmentAccounts.length > 0 && (
            <>
              {openAssets.length > 0 && (
                <Button variant="secondary" onClick={openUpdateValues}>
                  <RefreshCw aria-hidden="true" />
                  Atualizar valores
                </Button>
              )}
              <Button onClick={openCreateAsset}>
                <Plus aria-hidden="true" />
                Novo ativo
              </Button>
            </>
          )
        }
      />

      <ResourceView resource={resource} loadingLabel="Carregando investimentos…">
        {(data) => (
          <InvestmentsView
            data={data}
            onCreateAccount={() => {
              setAccountsOpen(true);
            }}
            onCreateAsset={openCreateAsset}
            onUpdateValues={openUpdateValues}
            onLinkTransfer={setLinking}
            onDetails={setDetail}
            onMovement={(asset, movementKind) => {
              setMovementForm({ kind: "create", asset, movementKind, date: today });
            }}
            onValue={(asset) => {
              setValuations({ assets: [asset], date: today });
            }}
            onEdit={(asset) => {
              setAssetForm({ kind: "edit", asset });
            }}
            onDelete={setDeletingAsset}
          />
        )}
      </ResourceView>

      <AssetFormDialog
        mode={assetForm}
        accounts={investmentAccounts}
        onSubmit={async (input) => {
          const id = assetForm?.kind === "edit" ? assetForm.asset.id : null;
          const saved = await actions.saveAsset(id, input);
          setAssetForm(null);
          changed();
          if (id === null && pendingLink) {
            const transfer = pendingLink;
            setPendingLink(null);
            try {
              await actions.link(saved.id, transfer.transactionId, null);
              toast.success("Ativo cadastrado e vinculado", {
                description: `“${transfer.description}” → “${saved.name}”`,
              });
            } catch (error) {
              notifyError("O ativo foi cadastrado, mas não foi possível vincular", error);
            }
            return;
          }
          toast.success(id === null ? "Ativo cadastrado" : "Ativo atualizado", {
            description:
              id === null
                ? `“${saved.name}”: registre a aplicação e informe o valor atual.`
                : `“${saved.name}”`,
          });
        }}
        onClose={() => {
          setAssetForm(null);
          setPendingLink(null);
        }}
      />

      <MovementFormDialog
        mode={movementForm}
        accounts={loaded?.accounts ?? []}
        onSubmit={async (input) => {
          if (!movementForm) return;
          const { asset } = movementForm;
          const id = movementForm.kind === "edit" ? movementForm.movement.id : null;
          const saved = await actions.saveMovement(asset.id, id, input);
          setMovementForm(null);
          changed();
          toast.success(
            id === null ? movementRegisteredLabels[saved.kind] : "Movimentação atualizada",
            {
              description: `“${asset.name}” · ${formatCents(saved.amount)} em ${formatDate(saved.date)}`,
            },
          );
        }}
        onClose={() => {
          setMovementForm(null);
        }}
      />

      <ValuationsDialog
        target={valuations}
        onSubmit={async (inputs) => {
          await actions.setValuations(inputs);
          setValuations(null);
          changed();
          toast.success(
            inputs.length === 1 ? "Valor atualizado" : `${inputs.length} valores atualizados`,
            {
              description: `Em ${formatDate(inputs[0]?.date ?? today)}`,
            },
          );
        }}
        onClose={() => {
          setValuations(null);
        }}
      />

      <AssetDetailDialog
        asset={detail}
        version={detailVersion}
        accounts={accountNames}
        loadAsset={actions.loadAsset}
        onMovement={(asset, movementKind) => {
          setMovementForm({ kind: "create", asset, movementKind, date: today });
        }}
        onEditMovement={(asset, movement) => {
          setMovementForm({ kind: "edit", asset, movement });
        }}
        onDeleteMovement={(asset, movement) => {
          setDeletingMovement({ asset, movement });
        }}
        onValue={(asset) => {
          setValuations({ assets: [asset], date: today });
        }}
        onDeleteValuation={(asset, valuation) => {
          setDeletingValuation({ asset, valuation });
        }}
        onClose={() => {
          setDetail(null);
        }}
      />

      <LinkAssetDialog
        transfer={linking}
        assets={loaded?.investments.assets ?? []}
        accountName={(id) => accountNames.get(id)?.name ?? "conta de investimentos"}
        onLink={async (transfer, asset, quantity) => {
          await actions.link(asset.id, transfer.transactionId, quantity);
          setLinking(null);
          changed();
          toast.success("Transferência vinculada", {
            description: `“${transfer.description}” → “${asset.name}”`,
          });
        }}
        onCreateAsset={(transfer) => {
          setLinking(null);
          setPendingLink(transfer);
          setAssetForm({ kind: "create", accountId: transfer.investmentAccountId });
        }}
        onClose={() => {
          setLinking(null);
        }}
      />

      <AccountsDialog
        open={accountsOpen}
        accounts={loaded?.accounts ?? []}
        onSave={async (id, input) => {
          const saved = await actions.saveAccount(id, input);
          toast.success(id === null ? "Conta criada" : "Conta atualizada", {
            description: `“${saved.name}”`,
          });
        }}
        onDelete={async (account) => {
          try {
            await actions.removeAccount(account.id);
            toast.success("Conta excluída", { description: `“${account.name}”` });
          } catch (error) {
            notifyError("Não foi possível excluir a conta", error);
          }
        }}
        onClose={() => {
          setAccountsOpen(false);
        }}
      />

      <ConfirmDeleteDialog
        item={deletingAsset}
        title="Excluir ativo?"
        describe={(asset) => (
          <>
            O ativo <strong className="text-foreground">“{asset.name}”</strong> será excluído
            permanentemente, com as {asset.position.movementCount} movimentações e os valores
            informados. Os lançamentos vinculados continuam em Lançamentos e voltam a aparecer como
            transferências sem ativo.
          </>
        )}
        confirmLabel="Excluir ativo"
        onConfirm={async (asset) => {
          try {
            await actions.removeAsset(asset.id);
            if (detail?.id === asset.id) setDetail(null);
            toast.success("Ativo excluído", { description: `“${asset.name}”` });
          } catch (error) {
            notifyError("Não foi possível excluir o ativo", error);
          } finally {
            setDeletingAsset(null);
          }
        }}
        onCancel={() => {
          setDeletingAsset(null);
        }}
      />

      <ConfirmDeleteDialog
        item={deletingMovement}
        title="Excluir movimentação?"
        describe={({ asset, movement }) => (
          <>
            A movimentação ({movementKindLabels[movement.kind].toLowerCase()} de{" "}
            <strong className="text-foreground">{formatCents(movement.amount)}</strong> em{" "}
            {formatDate(movement.date)}) de “{asset.name}” será excluída permanentemente.
            {movement.transactionId !== null &&
              " O lançamento vinculado continua em Lançamentos e volta a aparecer como transferência sem ativo."}
          </>
        )}
        confirmLabel="Excluir movimentação"
        onConfirm={async ({ movement }) => {
          try {
            await actions.removeMovement(movement.id);
            changed();
            toast.success("Movimentação excluída");
          } catch (error) {
            notifyError("Não foi possível excluir a movimentação", error);
          } finally {
            setDeletingMovement(null);
          }
        }}
        onCancel={() => {
          setDeletingMovement(null);
        }}
      />

      <ConfirmDeleteDialog
        item={deletingValuation}
        title="Excluir valor informado?"
        describe={({ asset, valuation }) => (
          <>
            O valor de <strong className="text-foreground">{formatCents(valuation.value)}</strong>{" "}
            informado em {formatDate(valuation.date)} para “{asset.name}” será excluído
            permanentemente. O valor atual passa a usar o informado antes dele.
          </>
        )}
        confirmLabel="Excluir valor"
        onConfirm={async ({ asset, valuation }) => {
          try {
            await actions.removeValuation(asset.id, valuation.date);
            changed();
            toast.success("Valor excluído");
          } catch (error) {
            notifyError("Não foi possível excluir o valor", error);
          } finally {
            setDeletingValuation(null);
          }
        }}
        onCancel={() => {
          setDeletingValuation(null);
        }}
      />
    </>
  );
}
