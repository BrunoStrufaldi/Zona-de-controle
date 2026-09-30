import { Save } from "lucide-react";
import { type SyntheticEvent, useId, useState } from "react";

import { Field } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ColorDot } from "@/features/finance/components/account-select";
import { categoryDotClass } from "@/features/finance/components/finance-styles";
import {
  emptyMovementDraft,
  INVESTMENT_LIMITS,
  type MovementDraft,
  type MovementDraftErrors,
  movementKindLabels,
  toMovementDraft,
  tracksQuantity,
  validateMovementDraft,
} from "@/features/finance/domain/investments";
import {
  type FinanceAccount,
  type InvestmentAsset,
  type InvestmentMovement,
  MOVEMENT_KINDS,
  type MovementInput,
  type MovementKind,
} from "@/features/finance/types";
import { toServiceError } from "@/services/tauri/errors";
import { type IsoDate } from "@/types/common";

const NO_TRANSACTION = "none";

export type MovementFormMode =
  | { kind: "create"; asset: InvestmentAsset; movementKind: MovementKind; date: IsoDate }
  | { kind: "edit"; asset: InvestmentAsset; movement: InvestmentMovement };

interface MovementFormDialogProps {
  /** `null` fecha o diálogo. */
  mode: MovementFormMode | null;
  accounts: readonly FinanceAccount[];
  onSubmit: (input: MovementInput) => Promise<void>;
  onClose: () => void;
}

const accountLabel: Record<MovementKind, string> = {
  contribution: "Sai da conta",
  withdrawal: "Vai para a conta",
  income: "Recebido na conta",
};

/** Conta sugerida para o dinheiro: a primeira conta corrente. */
function defaultAccount(accounts: readonly FinanceAccount[], asset: InvestmentAsset) {
  const others = accounts.filter((account) => account.id !== asset.accountId);
  return (others.find((account) => account.kind === "checking") ?? others[0])?.id ?? null;
}

export function MovementFormDialog({ mode, accounts, onSubmit, onClose }: MovementFormDialogProps) {
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
            <DialogTitle>
              {mode.kind === "edit" ? "Editar movimentação" : "Registrar movimentação"}
            </DialogTitle>
            <DialogDescription>
              “{mode.asset.name}”.{" "}
              {mode.kind === "edit" && mode.movement.transactionId !== null
                ? "O valor e a data vêm do lançamento vinculado; para mudá-los, edite-o em Lançamentos."
                : "Campos com * são obrigatórios."}
            </DialogDescription>
          </DialogHeader>
          <MovementForm
            key={mode.kind === "edit" ? mode.movement.id : `${mode.asset.id}:${mode.movementKind}`}
            mode={mode}
            initial={
              mode.kind === "edit"
                ? toMovementDraft(mode.movement)
                : emptyMovementDraft(
                    mode.movementKind,
                    mode.date,
                    defaultAccount(accounts, mode.asset),
                  )
            }
            accounts={accounts}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

interface MovementFormProps {
  mode: MovementFormMode;
  initial: MovementDraft;
  accounts: readonly FinanceAccount[];
  onSubmit: (input: MovementInput) => Promise<void>;
  onCancel: () => void;
}

function MovementForm({ mode, initial, accounts, onSubmit, onCancel }: MovementFormProps) {
  const [draft, setDraft] = useState<MovementDraft>(initial);
  const [errors, setErrors] = useState<MovementDraftErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ids = {
    amount: useId(),
    date: useId(),
    quantity: useId(),
    account: useId(),
    closes: useId(),
    notes: useId(),
  };
  const { asset } = mode;
  const creating = mode.kind === "create";
  const linked = mode.kind === "edit" && mode.movement.transactionId !== null;
  const showQuantity =
    draft.kind !== "income" && (tracksQuantity(asset.class) || asset.position.quantity !== null);
  const assetAccount = accounts.find((account) => account.id === asset.accountId);
  const otherAccounts = accounts.filter((account) => account.id !== asset.accountId);

  const update = (patch: Partial<MovementDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateMovementDraft(draft);
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
      <Tabs
        value={draft.kind}
        onValueChange={(value) => {
          update({ kind: value as MovementKind });
        }}
      >
        <TabsList aria-label="Tipo da movimentação" className="w-full">
          {MOVEMENT_KINDS.map((kind) => (
            <TabsTrigger key={kind} value={kind} className="flex-1" disabled={linked}>
              {movementKindLabels[kind]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor (R$) *" htmlFor={ids.amount} error={errors.amountText}>
          <Input
            id={ids.amount}
            value={draft.amountText}
            inputMode="decimal"
            placeholder="0,00"
            autoFocus={!linked}
            disabled={linked}
            className="font-mono tabular"
            aria-invalid={errors.amountText !== undefined || undefined}
            onChange={(event) => {
              update({ amountText: event.target.value });
            }}
          />
        </Field>
        <Field label="Data *" htmlFor={ids.date} error={errors.date}>
          <Input
            id={ids.date}
            type="date"
            value={draft.date}
            disabled={linked}
            aria-invalid={errors.date !== undefined || undefined}
            onChange={(event) => {
              update({ date: event.target.value });
            }}
          />
        </Field>
      </div>

      {showQuantity && (
        <Field label="Quantidade (opcional)" htmlFor={ids.quantity} error={errors.quantityText}>
          <Input
            id={ids.quantity}
            value={draft.quantityText}
            inputMode="decimal"
            placeholder="Ex.: 100 ou 0,00125"
            className="font-mono tabular"
            aria-invalid={errors.quantityText !== undefined || undefined}
            onChange={(event) => {
              update({ quantityText: event.target.value });
            }}
          />
        </Field>
      )}

      {creating && (
        <Field label={accountLabel[draft.kind]} htmlFor={ids.account}>
          <Select
            value={draft.accountId === null ? NO_TRANSACTION : String(draft.accountId)}
            onValueChange={(value) => {
              update({ accountId: value === NO_TRANSACTION ? null : Number(value) });
            }}
          >
            <SelectTrigger id={ids.account}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {otherAccounts.map((account) => (
                <SelectItem key={account.id} value={String(account.id)}>
                  <ColorDot className={categoryDotClass[account.color]} />
                  {account.name}
                </SelectItem>
              ))}
              <SelectItem value={NO_TRANSACTION}>Sem lançamento (feito fora do app)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {draft.accountId === null
              ? draft.kind === "income"
                ? "O provento conta no resultado, mas nada entra nas contas."
                : `Nada é lançado nas contas: o valor sai do saldo de ${assetAccount?.name ?? "a conta do ativo"}. Use para o que já estava investido antes do app.`
              : draft.kind === "income"
                ? "Cria a entrada nessa conta, vinculada ao provento."
                : `Cria a transferência ${draft.kind === "contribution" ? "dessa conta para" : "para essa conta, saindo de"} ${assetAccount?.name ?? "a conta do ativo"}, vinculada.`}
          </p>
        </Field>
      )}

      {creating && draft.kind === "withdrawal" && (
        <div className="flex items-start gap-2">
          <Checkbox
            id={ids.closes}
            checked={draft.closesPosition}
            onCheckedChange={(checked) => {
              update({ closesPosition: checked === true });
            }}
          />
          <Label htmlFor={ids.closes} className="grid gap-0.5 font-normal">
            Resgate total
            <span className="text-xs text-muted-foreground">
              O valor do ativo passa a ser zero e ele vai para os encerrados.
            </span>
          </Label>
        </div>
      )}

      <Field label="Observação" htmlFor={ids.notes} error={errors.notes}>
        <Textarea
          id={ids.notes}
          value={draft.notes}
          rows={2}
          maxLength={INVESTMENT_LIMITS.movementNotesChars}
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
          {saving
            ? "Salvando…"
            : creating
              ? `Registrar ${movementKindLabels[draft.kind].toLowerCase()}`
              : "Salvar alterações"}
        </Button>
      </DialogFooter>
    </form>
  );
}
