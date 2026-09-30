import { Link2, Plus } from "lucide-react";
import { type SyntheticEvent, useId, useState } from "react";

import { Field } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  assetClassLabels,
  movementKindLabels,
  parseQuantity,
  predatesValuation,
  tracksQuantity,
} from "@/features/finance/domain/investments";
import {
  type InvestmentAsset,
  type Quantity,
  type UnlinkedTransfer,
} from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { formatCents, formatDate } from "@/lib/format";
import { toServiceError } from "@/services/tauri/errors";

interface LinkAssetDialogProps {
  /** `null` fecha o diálogo. */
  transfer: UnlinkedTransfer | null;
  /** Todos os ativos (o diálogo mostra só os da conta da transferência). */
  assets: readonly InvestmentAsset[];
  accountName: (id: number) => string;
  onLink: (
    transfer: UnlinkedTransfer,
    asset: InvestmentAsset,
    quantity: Quantity | null,
  ) => Promise<void>;
  /** Cadastrar um ativo novo na conta e vincular a ele. */
  onCreateAsset: (transfer: UnlinkedTransfer) => void;
  onClose: () => void;
}

/** Escolha do ativo de uma transferência sem ativo (aplicação ou resgate). */
export function LinkAssetDialog({
  transfer,
  assets,
  accountName,
  onLink,
  onCreateAsset,
  onClose,
}: LinkAssetDialogProps) {
  return (
    <Dialog
      open={transfer !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {transfer && (
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Vincular {movementKindLabels[transfer.kind].toLowerCase()} a um ativo
            </DialogTitle>
            <DialogDescription>
              “{transfer.description}” de {formatCents(transfer.amount)} em{" "}
              {formatDate(transfer.date)}, em {accountName(transfer.investmentAccountId)}. Aparecem
              os ativos dessa conta.
            </DialogDescription>
          </DialogHeader>
          <LinkForm
            key={transfer.transactionId}
            transfer={transfer}
            assets={assets.filter((asset) => asset.accountId === transfer.investmentAccountId)}
            onLink={onLink}
            onCreateAsset={onCreateAsset}
            onCancel={onClose}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

interface LinkFormProps {
  transfer: UnlinkedTransfer;
  assets: readonly InvestmentAsset[];
  onLink: LinkAssetDialogProps["onLink"];
  onCreateAsset: (transfer: UnlinkedTransfer) => void;
  onCancel: () => void;
}

function LinkForm({ transfer, assets, onLink, onCreateAsset, onCancel }: LinkFormProps) {
  const open = assets.filter((asset) => !asset.position.closed);
  const [selected, setSelected] = useState<number | null>(
    open.length === 1 ? (open[0]?.id ?? null) : null,
  );
  const [quantityText, setQuantityText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const quantityId = useId();
  const asset = assets.find((item) => item.id === selected);
  const showQuantity =
    asset !== undefined && (tracksQuantity(asset.class) || asset.position.quantity !== null);

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!asset) {
      setError("Escolha o ativo.");
      return;
    }
    const quantity = showQuantity ? parseQuantity(quantityText) : null;
    if (showQuantity && quantityText.trim() !== "" && quantity === null) {
      setError("Quantidade inválida (até 8 casas decimais).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onLink(transfer, asset, quantity);
    } catch (linkError) {
      setError(toServiceError(linkError).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      {assets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum ativo nessa conta ainda. Cadastre o ativo e a transferência já fica vinculada.
        </p>
      ) : (
        <div role="radiogroup" aria-label="Ativo" className="grid gap-1.5">
          {assets.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected === item.id}
              onClick={() => {
                setSelected(item.id);
              }}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                selected === item.id
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-border-strong",
              )}
            >
              <span className="grid min-w-0 flex-1">
                <span className="truncate font-medium">{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  {assetClassLabels[item.class]}
                  {item.position.closed && " · encerrado"}
                </span>
              </span>
              <span className="font-mono text-xs tabular">{formatCents(item.position.value)}</span>
            </button>
          ))}
        </div>
      )}

      {asset && predatesValuation(asset.position, transfer.date) && asset.position.valuedOn && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          O último valor de “{asset.name}” foi informado em {formatDate(asset.position.valuedOn)},
          depois desta {movementKindLabels[transfer.kind].toLowerCase()}. Se ele já a incluía, tudo
          certo; se não, informe o valor atual de novo depois de vincular.
        </p>
      )}

      {showQuantity && (
        <Field label="Quantidade (opcional)" htmlFor={quantityId}>
          <Input
            id={quantityId}
            value={quantityText}
            inputMode="decimal"
            placeholder="Ex.: 100 ou 0,00125"
            className="font-mono tabular"
            onChange={(event) => {
              setQuantityText(event.target.value);
            }}
          />
        </Field>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <DialogFooter className="sm:justify-between">
        <Button
          variant="ghost"
          onClick={() => {
            onCreateAsset(transfer);
          }}
        >
          <Plus aria-hidden="true" />
          Novo ativo
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || assets.length === 0}>
            <Link2 aria-hidden="true" />
            {saving ? "Vinculando…" : "Vincular"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
