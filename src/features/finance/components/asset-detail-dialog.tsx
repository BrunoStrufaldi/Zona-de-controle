import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleDollarSign,
  Link2,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { gainToneClass } from "@/features/finance/components/finance-styles";
import {
  assetClassLabels,
  formatGainWithRate,
  formatQuantity,
  movementKindLabels,
  valueStatusText,
} from "@/features/finance/domain/investments";
import {
  type AssetDetail,
  type FinanceAccount,
  type InvestmentAsset,
  type InvestmentMovement,
  type MovementKind,
  type Valuation,
} from "@/features/finance/types";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { cn } from "@/lib/cn";
import { formatCents, formatDate } from "@/lib/format";

interface AssetDetailDialogProps {
  /** `null` fecha o diálogo. */
  asset: InvestmentAsset | null;
  /** Muda a cada alteração salva, para reler o histórico. */
  version: number;
  accounts: ReadonlyMap<number, FinanceAccount>;
  loadAsset: (id: number) => Promise<AssetDetail>;
  onMovement: (asset: InvestmentAsset, kind: MovementKind) => void;
  onEditMovement: (asset: InvestmentAsset, movement: InvestmentMovement) => void;
  onDeleteMovement: (asset: InvestmentAsset, movement: InvestmentMovement) => void;
  onValue: (asset: InvestmentAsset) => void;
  onDeleteValuation: (asset: InvestmentAsset, valuation: Valuation) => void;
  onClose: () => void;
}

const movementIcons = {
  contribution: ArrowDownLeft,
  withdrawal: ArrowUpRight,
  income: CircleDollarSign,
} as const;

/** Resumo, movimentações e valores informados de um ativo. */
export function AssetDetailDialog({ asset, onClose, ...props }: AssetDetailDialogProps) {
  return (
    <Dialog
      open={asset !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {asset && (
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{asset.name}</DialogTitle>
            <DialogDescription>
              {assetClassLabels[asset.class]}
              {asset.ticker && ` · ${asset.ticker}`}
              {` · ${props.accounts.get(asset.accountId)?.name ?? "conta de investimentos"}`}
              {asset.maturityDate && ` · vence em ${formatDate(asset.maturityDate)}`}
            </DialogDescription>
          </DialogHeader>
          <DetailContent assetId={asset.id} {...props} />
        </DialogContent>
      )}
    </Dialog>
  );
}

type DetailContentProps = Omit<AssetDetailDialogProps, "asset" | "onClose"> & { assetId: number };

function DetailContent({
  assetId,
  version,
  loadAsset,
  onMovement,
  onEditMovement,
  onDeleteMovement,
  onValue,
  onDeleteValuation,
}: DetailContentProps) {
  const load = useCallback(
    () => loadAsset(assetId),
    // `version` só força a releitura depois de cada alteração.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadAsset, assetId, version],
  );
  const detail = useAsyncResource(load);

  return (
    <ResourceView resource={detail} loadingLabel="Carregando histórico…" className="py-8">
      {({ asset, movements, valuations }) => (
        <div className="grid gap-5">
          <dl className="grid grid-cols-2 gap-3 rounded-md border border-border bg-background/40 p-3 text-sm sm:grid-cols-3">
            <Summary label="Valor atual" value={formatCents(asset.position.value)}>
              {valueStatusText(asset.position)}
            </Summary>
            <Summary label="Resultado" value={formatGainWithRate(asset.position)}>
              <span className={gainToneClass(asset.position.gain)}>
                {asset.position.income > 0
                  ? `inclui ${formatCents(asset.position.income)} em proventos`
                  : "valor + resgates − aplicações"}
              </span>
            </Summary>
            <Summary label="Aplicado líquido" value={formatCents(asset.position.invested)}>
              {formatCents(asset.position.contributed)} aplicados ·{" "}
              {formatCents(asset.position.withdrawn)} resgatados
            </Summary>
            {asset.position.quantity !== null && (
              <Summary label="Quantidade" value={formatQuantity(asset.position.quantity)}>
                {asset.position.averagePrice !== null &&
                  `preço médio ${formatCents(asset.position.averagePrice)}`}
              </Summary>
            )}
          </dl>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                onValue(asset);
              }}
            >
              <RefreshCw aria-hidden="true" />
              Informar valor
            </Button>
            {(["contribution", "withdrawal", "income"] as const).map((kind) => {
              const Icon = movementIcons[kind];
              return (
                <Button
                  key={kind}
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    onMovement(asset, kind);
                  }}
                >
                  <Icon aria-hidden="true" />
                  {movementKindLabels[kind]}
                </Button>
              );
            })}
          </div>

          <section className="grid gap-2">
            <h3 className="text-sm font-medium">Movimentações</h3>
            {movements.length === 0 ? (
              <EmptyState
                icon={ArrowDownLeft}
                title="Nenhuma movimentação"
                description="Registre a aplicação para acompanhar o que foi investido."
                className="py-6"
              />
            ) : (
              <ul className="grid gap-1.5" aria-label="Movimentações">
                {movements.map((movement) => {
                  const Icon = movementIcons[movement.kind];
                  return (
                    <li
                      key={movement.id}
                      className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
                    >
                      <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground tabular">
                        {formatDate(movement.date)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                        <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        {movementKindLabels[movement.kind]}
                        {movement.quantity !== null && (
                          <span className="text-xs text-muted-foreground">
                            · {formatQuantity(movement.quantity)} un.
                          </span>
                        )}
                        {movement.transactionId !== null && (
                          <Badge variant="outline" title="Ligada a um lançamento das contas">
                            <Link2 aria-hidden="true" />
                            Lançamento
                          </Badge>
                        )}
                        {movement.notes && (
                          <span className="truncate text-xs text-muted-foreground">
                            · {movement.notes}
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 font-mono tabular",
                          movement.kind === "income" && "text-success",
                        )}
                      >
                        {formatCents(movement.amount)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${movementKindLabels[movement.kind].toLowerCase()} de ${formatDate(movement.date)}`}
                        onClick={() => {
                          onEditMovement(asset, movement);
                        }}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Excluir ${movementKindLabels[movement.kind].toLowerCase()} de ${formatDate(movement.date)}`}
                        className="text-danger hover:text-danger"
                        onClick={() => {
                          onDeleteMovement(asset, movement);
                        }}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="grid gap-2">
            <h3 className="text-sm font-medium">Valores informados</h3>
            {valuations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum valor informado ainda: o valor atual considera o que foi aplicado.
              </p>
            ) : (
              <ul className="grid gap-1.5" aria-label="Valores informados">
                {valuations.map((valuation) => (
                  <li
                    key={valuation.date}
                    className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
                  >
                    <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground tabular">
                      {formatDate(valuation.date)}
                    </span>
                    <span className="flex-1 font-mono tabular">{formatCents(valuation.value)}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Excluir o valor de ${formatDate(valuation.date)}`}
                      className="text-danger hover:text-danger"
                      onClick={() => {
                        onDeleteValuation(asset, valuation);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </ResourceView>
  );
}

function Summary({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="grid gap-0.5">
        <span className="font-mono font-semibold tabular">{value}</span>
        {children && <span className="text-xs text-muted-foreground">{children}</span>}
      </dd>
    </div>
  );
}
