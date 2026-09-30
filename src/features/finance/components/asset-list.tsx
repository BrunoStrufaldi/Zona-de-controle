import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleDollarSign,
  History,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { categoryDotClass, gainToneClass } from "@/features/finance/components/finance-styles";
import {
  assetClassColors,
  assetClassLabels,
  formatGainWithRate,
  formatQuantity,
  valueStatusText,
} from "@/features/finance/domain/investments";
import {
  type AssetClass,
  type FinanceAccount,
  type InvestmentAsset,
  type MovementKind,
} from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { formatCents, formatDate } from "@/lib/format";

export interface AssetActions {
  onDetails: (asset: InvestmentAsset) => void;
  onMovement: (asset: InvestmentAsset, kind: MovementKind) => void;
  onValue: (asset: InvestmentAsset) => void;
  onEdit: (asset: InvestmentAsset) => void;
  onDelete: (asset: InvestmentAsset) => void;
}

interface AssetGroupProps extends AssetActions {
  assetClass: AssetClass | null;
  /** Na ordem do Rust (maior valor primeiro). */
  assets: readonly InvestmentAsset[];
  accounts: ReadonlyMap<number, FinanceAccount>;
  label: string;
}

/** Ativos de uma classe (ou os encerrados), com o total da classe no cabeçalho. */
export function AssetGroup({ assetClass, assets, accounts, label, ...actions }: AssetGroupProps) {
  const total = assets.reduce((sum, asset) => sum + asset.position.value, 0);
  return (
    <section className="grid gap-2">
      {assetClass && (
        <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <span
            aria-hidden="true"
            className={cn("size-2 rounded-full", categoryDotClass[assetClassColors[assetClass]])}
          />
          <span className="flex-1">{assetClassLabels[assetClass]}</span>
          <span className="font-mono normal-case tabular">{formatCents(total)}</span>
        </h3>
      )}
      <ul className="grid gap-2" aria-label={label}>
        {assets.map((asset) => (
          <AssetRow
            key={asset.id}
            asset={asset}
            account={accounts.get(asset.accountId)}
            {...actions}
          />
        ))}
      </ul>
    </section>
  );
}

interface AssetRowProps extends AssetActions {
  asset: InvestmentAsset;
  account: FinanceAccount | undefined;
}

function AssetRow({ asset, account, ...actions }: AssetRowProps) {
  const { position } = asset;

  return (
    <li
      className={cn(
        "flex animate-fade-in items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors duration-150 hover:border-border-strong",
        position.closed && "opacity-60",
      )}
    >
      <div className="grid min-w-0 flex-1 gap-1">
        <button
          type="button"
          onClick={() => {
            actions.onDetails(asset);
          }}
          className="cursor-pointer truncate text-left text-sm font-medium transition-colors hover:text-primary"
        >
          {asset.name}
          {asset.ticker && (
            <span className="ml-2 font-mono text-xs text-muted-foreground">{asset.ticker}</span>
          )}
        </button>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {account && <span>{account.name}</span>}
          {position.quantity !== null && position.quantity > 0 && (
            <span>
              · {formatQuantity(position.quantity)} un.
              {position.averagePrice !== null &&
                ` · preço médio ${formatCents(position.averagePrice)}`}
            </span>
          )}
          {asset.maturityDate && <span>· vence em {formatDate(asset.maturityDate)}</span>}
          {position.closed ? (
            <Badge variant="default">Encerrado</Badge>
          ) : (
            position.stale && (
              <Badge variant="warning" title={valueStatusText(position)}>
                Atualizar valor
              </Badge>
            )
          )}
        </div>
      </div>

      <div className="grid w-44 shrink-0 justify-items-end gap-0.5 text-right">
        <span className="font-mono text-sm font-semibold tabular">
          {formatCents(position.value)}
        </span>
        <span className={cn("font-mono text-xs tabular", gainToneClass(position.gain))}>
          {formatGainWithRate(position)}
        </span>
        {!position.closed && (
          <span className="text-[11px] text-subtle-foreground">{valueStatusText(position)}</span>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Ações do ativo “${asset.name}”`}
            className="shrink-0"
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onSelect={() => {
              actions.onValue(asset);
            }}
          >
            <RefreshCw aria-hidden="true" />
            Informar valor atual…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              actions.onMovement(asset, "contribution");
            }}
          >
            <ArrowDownLeft aria-hidden="true" />
            Registrar aplicação…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              actions.onMovement(asset, "withdrawal");
            }}
          >
            <ArrowUpRight aria-hidden="true" />
            Registrar resgate…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              actions.onMovement(asset, "income");
            }}
          >
            <CircleDollarSign aria-hidden="true" />
            Registrar provento…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              actions.onDetails(asset);
            }}
          >
            <History aria-hidden="true" />
            Histórico
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              actions.onEdit(asset);
            }}
          >
            <Pencil aria-hidden="true" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-danger focus:text-danger [&_svg]:text-danger"
            onSelect={() => {
              actions.onDelete(asset);
            }}
          >
            <Trash2 aria-hidden="true" />
            Excluir…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
