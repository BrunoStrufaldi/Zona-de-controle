import { Save } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AccountSelect } from "@/features/finance/components/account-select";
import {
  type AssetDraft,
  type AssetDraftErrors,
  assetClassHints,
  assetClassLabels,
  emptyAssetDraft,
  INVESTMENT_LIMITS,
  toAssetDraft,
  validateAssetDraft,
} from "@/features/finance/domain/investments";
import {
  ASSET_CLASSES,
  type AssetClass,
  type AssetInput,
  type FinanceAccount,
  type InvestmentAsset,
} from "@/features/finance/types";
import { toServiceError } from "@/services/tauri/errors";

/** `create` pode vir com a conta já escolhida (ex.: ao vincular uma transferência). */
export type AssetFormMode =
  { kind: "create"; accountId: number | null } | { kind: "edit"; asset: InvestmentAsset };

interface AssetFormDialogProps {
  /** `null` fecha o diálogo. */
  mode: AssetFormMode | null;
  /** Só as contas do tipo Investimentos. */
  accounts: readonly FinanceAccount[];
  onSubmit: (input: AssetInput) => Promise<void>;
  onClose: () => void;
}

export function AssetFormDialog({ mode, accounts, onSubmit, onClose }: AssetFormDialogProps) {
  const initial = (current: AssetFormMode): AssetDraft => {
    if (current.kind === "edit") return toAssetDraft(current.asset);
    // Com uma conta de investimentos só, ela já vem escolhida.
    const single = accounts.length === 1 ? (accounts[0]?.id ?? null) : null;
    return emptyAssetDraft(current.accountId ?? single);
  };

  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {mode && (
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{mode.kind === "edit" ? "Editar ativo" : "Novo ativo"}</DialogTitle>
            <DialogDescription>
              O valor atual você informa depois, copiando do app do banco ou da corretora.
            </DialogDescription>
          </DialogHeader>
          <AssetForm
            key={mode.kind === "edit" ? mode.asset.id : "create"}
            initial={initial(mode)}
            submitLabel={mode.kind === "edit" ? "Salvar alterações" : "Cadastrar ativo"}
            accounts={accounts}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

interface AssetFormProps {
  initial: AssetDraft;
  submitLabel: string;
  accounts: readonly FinanceAccount[];
  onSubmit: (input: AssetInput) => Promise<void>;
  onCancel: () => void;
}

function AssetForm({ initial, submitLabel, accounts, onSubmit, onCancel }: AssetFormProps) {
  const [draft, setDraft] = useState<AssetDraft>(initial);
  const [errors, setErrors] = useState<AssetDraftErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ids = {
    class: useId(),
    name: useId(),
    ticker: useId(),
    account: useId(),
    maturity: useId(),
    notes: useId(),
  };
  const fixedIncome = draft.class === "fixed_income";

  const update = (patch: Partial<AssetDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateAssetDraft(draft);
    setErrors(validation.errors);
    if (validation.input === null) return;
    setSaving(true);
    setSubmitError(null);
    try {
      await onSubmit(validation.input);
    } catch (error) {
      setSubmitError(toServiceError(error).message);
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Classe *" htmlFor={ids.class}>
          <Select
            value={draft.class}
            onValueChange={(value) => {
              update({ class: value as AssetClass });
            }}
          >
            <SelectTrigger id={ids.class}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_CLASSES.map((assetClass) => (
                <SelectItem key={assetClass} value={assetClass}>
                  {assetClassLabels[assetClass]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Conta de investimentos *" htmlFor={ids.account} error={errors.accountId}>
          <AccountSelect
            id={ids.account}
            accounts={accounts}
            value={draft.accountId}
            invalid={errors.accountId !== undefined}
            onChange={(accountId) => {
              update({ accountId });
            }}
          />
        </Field>
      </div>

      <Field label="Nome *" htmlFor={ids.name} error={errors.name}>
        <Input
          id={ids.name}
          value={draft.name}
          maxLength={INVESTMENT_LIMITS.nameChars}
          autoFocus
          placeholder={assetClassHints[draft.class]}
          aria-invalid={errors.name !== undefined || undefined}
          onChange={(event) => {
            update({ name: event.target.value });
          }}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Código (opcional)" htmlFor={ids.ticker} error={errors.ticker}>
          <Input
            id={ids.ticker}
            value={draft.ticker}
            maxLength={INVESTMENT_LIMITS.tickerChars}
            placeholder={fixedIncome ? "Ex.: TESOURO SELIC 2029" : "Ex.: ITSA4"}
            className="font-mono uppercase"
            aria-invalid={errors.ticker !== undefined || undefined}
            onChange={(event) => {
              update({ ticker: event.target.value });
            }}
          />
        </Field>
        {fixedIncome && (
          <Field label="Vencimento (opcional)" htmlFor={ids.maturity}>
            <Input
              id={ids.maturity}
              type="date"
              value={draft.maturityDate}
              onChange={(event) => {
                update({ maturityDate: event.target.value });
              }}
            />
          </Field>
        )}
      </div>

      <Field label="Observação" htmlFor={ids.notes} error={errors.notes}>
        <Textarea
          id={ids.notes}
          value={draft.notes}
          rows={2}
          maxLength={INVESTMENT_LIMITS.assetNotesChars}
          placeholder={fixedIncome ? "Ex.: 110% do CDI, liquidez no vencimento" : undefined}
          onChange={(event) => {
            update({ notes: event.target.value });
          }}
        />
      </Field>

      {submitError && (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {submitError}
        </p>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          <Save aria-hidden="true" />
          {saving ? "Salvando…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
