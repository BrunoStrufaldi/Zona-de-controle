import { Check, Landmark, Pencil, Plus, Trash2, X } from "lucide-react";
import { type SyntheticEvent, useId, useState } from "react";

import { ColorPicker } from "@/components/shared/color-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { ConfirmDeleteDialog } from "@/features/finance/components/confirm-delete-dialog";
import { balanceToneClass, categoryDotClass } from "@/features/finance/components/finance-styles";
import {
  ACCOUNT_LIMITS,
  normalizeName,
  suggestColor,
  validateName,
} from "@/features/finance/domain/categories";
import { describeStatementDays, parseStatementDays } from "@/features/finance/domain/cards";
import { accountKindLabels } from "@/features/finance/domain/labels";
import { parseSignedAmount, toAmountInput } from "@/features/finance/domain/money";
import {
  ACCOUNT_KINDS,
  type AccountInput,
  type AccountKind,
  type CategoryColor,
  type FinanceAccount,
} from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";
import { toServiceError } from "@/services/tauri/errors";

interface AccountsDialogProps {
  open: boolean;
  accounts: readonly FinanceAccount[];
  /** Cria (`id` nulo) ou edita. Erros sobem para o formulário. */
  onSave: (id: number | null, input: AccountInput) => Promise<unknown>;
  /** Exclusão definitiva, chamada só após a confirmação. */
  onDelete: (account: FinanceAccount) => Promise<void>;
  onClose: () => void;
}

/** Gestão das contas: criar, editar (nome, tipo, cor, saldo inicial) e excluir. */
export function AccountsDialog({ open, accounts, onSave, onDelete, onClose }: AccountsDialogProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<FinanceAccount | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setEditingId(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Contas</DialogTitle>
          <DialogDescription>
            Onde o dinheiro está: conta corrente, poupança, cartão, dinheiro. O saldo soma o saldo
            inicial e os lançamentos pagos.
          </DialogDescription>
        </DialogHeader>

        {accounts.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="Nenhuma conta ainda"
            description="Crie a primeira abaixo (ex.: C6, Nubank, Carteira)."
            className="py-6"
          />
        ) : (
          <ul className="grid gap-1.5" aria-label="Contas">
            {accounts.map((account) =>
              editingId === account.id ? (
                <li key={account.id}>
                  <AccountForm
                    initial={{
                      name: account.name,
                      kind: account.kind,
                      color: account.color,
                      openingBalance: account.openingBalance,
                      closingDay: account.closingDay,
                      dueDay: account.dueDay,
                    }}
                    accounts={accounts}
                    editingId={account.id}
                    onSubmit={async (input) => {
                      await onSave(account.id, input);
                      setEditingId(null);
                    }}
                    onCancel={() => {
                      setEditingId(null);
                    }}
                  />
                </li>
              ) : (
                <AccountRow
                  key={account.id}
                  account={account}
                  onEdit={() => {
                    setEditingId(account.id);
                  }}
                  onDelete={() => {
                    setDeleting(account);
                  }}
                />
              ),
            )}
          </ul>
        )}

        {accounts.length < ACCOUNT_LIMITS.accounts && (
          <section aria-label="Nova conta" className="grid gap-2 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Nova conta</h3>
            <AccountForm
              // Recria o formulário para sugerir outra cor após cada criação.
              key={accounts.length}
              initial={{
                name: "",
                kind: "checking",
                color: suggestColor(accounts),
                openingBalance: 0,
                closingDay: null,
                dueDay: null,
              }}
              accounts={accounts}
              editingId={null}
              onSubmit={async (input) => {
                await onSave(null, input);
              }}
            />
          </section>
        )}

        <ConfirmDeleteDialog
          item={deleting}
          title="Excluir conta?"
          describe={(account) => (
            <>
              A conta <strong className="text-foreground">“{account.name}”</strong> será excluída
              permanentemente.
            </>
          )}
          confirmLabel="Excluir conta"
          onConfirm={async (account) => {
            await onDelete(account);
            setDeleting(null);
          }}
          onCancel={() => {
            setDeleting(null);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface AccountRowProps {
  account: FinanceAccount;
  onEdit: () => void;
  onDelete: () => void;
}

function AccountRow({ account, onEdit, onDelete }: AccountRowProps) {
  const inUse = account.transactionCount > 0;
  const statement = describeStatementDays(account);
  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-raised/40 px-3 py-2">
      <span
        aria-hidden="true"
        className={cn("size-2.5 shrink-0 rounded-full", categoryDotClass[account.color])}
      />
      <div className="grid min-w-0 flex-1">
        <span className="truncate text-sm">{account.name}</span>
        <span className="text-xs text-muted-foreground">
          {accountKindLabels[account.kind]} · {account.transactionCount}{" "}
          {account.transactionCount === 1 ? "lançamento" : "lançamentos"}
          {statement && ` · ${statement}`}
        </span>
      </div>
      <span
        className={cn("font-mono text-sm tabular", balanceToneClass(account.balance))}
        aria-label={`Saldo de ${account.name}`}
      >
        {formatCents(account.balance)}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Editar conta “${account.name}”`}
        onClick={onEdit}
      >
        <Pencil aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-danger hover:text-danger"
        aria-label={`Excluir conta “${account.name}”`}
        title={inUse ? "Contas com lançamentos não podem ser excluídas" : undefined}
        disabled={inUse}
        onClick={onDelete}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </li>
  );
}

interface AccountFormProps {
  initial: AccountInput;
  accounts: readonly FinanceAccount[];
  editingId: number | null;
  onSubmit: (input: AccountInput) => Promise<void>;
  onCancel?: () => void;
}

function AccountForm({ initial, accounts, editingId, onSubmit, onCancel }: AccountFormProps) {
  const [name, setName] = useState(initial.name);
  const [kind, setKind] = useState<AccountKind>(initial.kind);
  const [color, setColor] = useState<CategoryColor>(initial.color);
  const [balanceText, setBalanceText] = useState(
    initial.openingBalance === 0 ? "" : toAmountInput(initial.openingBalance),
  );
  const [closingText, setClosingText] = useState(
    initial.closingDay === null ? "" : String(initial.closingDay),
  );
  const [dueText, setDueText] = useState(initial.dueDay === null ? "" : String(initial.dueDay));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ids = {
    name: useId(),
    kind: useId(),
    balance: useId(),
    closing: useId(),
    due: useId(),
    error: useId(),
  };
  const card = kind === "credit_card";

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nameError = validateName(
      name,
      accounts,
      editingId,
      ACCOUNT_LIMITS.nameChars,
      (clash) => `Já existe uma conta chamada “${clash}”.`,
    );
    const openingBalance = parseSignedAmount(balanceText);
    // Fora do cartão, os dias da fatura não valem.
    const days = card ? parseStatementDays(closingText, dueText) : parseStatementDays("", "");
    const validation =
      nameError ??
      (openingBalance === null ? "Saldo inicial inválido. Use o formato 1.234,56." : null) ??
      days.error;
    setError(validation);
    if (validation !== null || openingBalance === null) return;

    setSaving(true);
    try {
      await onSubmit({
        name: normalizeName(name),
        kind,
        color,
        openingBalance,
        closingDay: days.closingDay,
        dueDay: days.dueDay,
      });
      if (editingId === null) {
        setName("");
        setBalanceText("");
      }
    } catch (submitError) {
      setError(toServiceError(submitError).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      noValidate
      className="grid gap-3 rounded-md border border-border p-3"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={ids.name}>Nome</Label>
          <Input
            id={ids.name}
            value={name}
            maxLength={ACCOUNT_LIMITS.nameChars}
            placeholder="Ex.: C6"
            aria-invalid={error !== null || undefined}
            aria-describedby={error ? ids.error : undefined}
            autoFocus={editingId !== null}
            className="h-8"
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={ids.kind}>Tipo</Label>
          <Select
            value={kind}
            onValueChange={(value) => {
              setKind(value as AccountKind);
            }}
          >
            <SelectTrigger id={ids.kind} className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_KINDS.map((option) => (
                <SelectItem key={option} value={option}>
                  {accountKindLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={ids.balance}>Saldo inicial (R$)</Label>
        <Input
          id={ids.balance}
          value={balanceText}
          inputMode="decimal"
          placeholder="0,00"
          className="h-8 font-mono tabular"
          onChange={(event) => {
            setBalanceText(event.target.value);
          }}
        />
        <p className="text-xs text-muted-foreground">
          O saldo no dia em que você começou a usar o app. Negativo para fatura em aberto (ex.:
          -1.500,00).
        </p>
      </div>
      {card && (
        <div className="grid gap-1.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={ids.closing}>Fecha no dia</Label>
              <Input
                id={ids.closing}
                value={closingText}
                inputMode="numeric"
                placeholder="Ex.: 28"
                className="h-8 font-mono tabular"
                onChange={(event) => {
                  setClosingText(event.target.value);
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={ids.due}>Vence no dia</Label>
              <Input
                id={ids.due}
                value={dueText}
                inputMode="numeric"
                placeholder="Ex.: 5"
                className="h-8 font-mono tabular"
                onChange={(event) => {
                  setDueText(event.target.value);
                }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Opcional. Compras a partir do dia do fechamento vão para a fatura seguinte. Com os dois
            dias, as recorrentes do cartão entram na previsão das próximas faturas.
          </p>
        </div>
      )}
      <ColorPicker label="Cor da conta" value={color} onChange={setColor} />
      {error && (
        <p id={ids.error} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X aria-hidden="true" />
            Cancelar
          </Button>
        )}
        <Button type="submit" size="sm" disabled={saving}>
          {editingId === null ? <Plus aria-hidden="true" /> : <Check aria-hidden="true" />}
          {editingId === null ? "Adicionar conta" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
