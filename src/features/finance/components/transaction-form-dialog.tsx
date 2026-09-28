import { Save } from "lucide-react";
import { type SyntheticEvent, useId, useState } from "react";

import { Field } from "@/components/shared/form-field";
import { TagInput } from "@/components/shared/tag-input";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { categoryDotClass } from "@/features/finance/components/finance-styles";
import { categoriesOfKind } from "@/features/finance/domain/categories";
import { indexById } from "@/features/finance/domain/filters";
import { statusLabel, transactionKindLabels } from "@/features/finance/domain/labels";
import {
  TRANSACTION_LIMITS,
  changeKind,
  emptyTransactionDraft,
  toTransactionDraft,
  type TransactionDraft,
  type TransactionDraftErrors,
  validateTransactionDraft,
} from "@/features/finance/domain/transaction-draft";
import {
  TRANSACTION_KINDS,
  TRANSACTION_STATUSES,
  type FinanceAccount,
  type FinanceCategory,
  type Transaction,
  type TransactionInput,
  type TransactionKind,
  type TransactionStatus,
} from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { mergeTags } from "@/lib/tags";
import { toServiceError } from "@/services/tauri/errors";
import { type IsoDate } from "@/types/common";

const NO_CATEGORY = "none";

const descriptionPlaceholder: Record<TransactionKind, string> = {
  expense: "Ex.: Mercado",
  income: "Ex.: Salário",
  transfer: "Ex.: Pagamento da fatura",
};

export type TransactionFormMode =
  { kind: "create"; date: IsoDate } | { kind: "edit"; transaction: Transaction };

interface TransactionFormDialogProps {
  /** `null` fecha o diálogo. */
  mode: TransactionFormMode | null;
  accounts: readonly FinanceAccount[];
  categories: readonly FinanceCategory[];
  tagSuggestions: readonly string[];
  onSubmit: (input: TransactionInput) => Promise<void>;
  onClose: () => void;
}

function initialDraft(mode: TransactionFormMode, accounts: readonly FinanceAccount[]) {
  if (mode.kind === "edit") return toTransactionDraft(mode.transaction);
  // Com uma conta só, ela já vem escolhida.
  return emptyTransactionDraft(accounts.length === 1 ? (accounts[0]?.id ?? null) : null, mode.date);
}

export function TransactionFormDialog({
  mode,
  accounts,
  categories,
  tagSuggestions,
  onSubmit,
  onClose,
}: TransactionFormDialogProps) {
  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {mode && (
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mode.kind === "edit" ? "Editar lançamento" : "Novo lançamento"}
            </DialogTitle>
            <DialogDescription>
              Campos com * são obrigatórios. Pendentes não entram no saldo das contas.
            </DialogDescription>
          </DialogHeader>
          <TransactionForm
            key={mode.kind === "edit" ? mode.transaction.id : "new"}
            initial={initialDraft(mode, accounts)}
            submitLabel={mode.kind === "edit" ? "Salvar alterações" : "Criar lançamento"}
            accounts={accounts}
            categories={categories}
            tagSuggestions={tagSuggestions}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

interface TransactionFormProps {
  initial: TransactionDraft;
  submitLabel: string;
  accounts: readonly FinanceAccount[];
  categories: readonly FinanceCategory[];
  tagSuggestions: readonly string[];
  onSubmit: (input: TransactionInput) => Promise<void>;
  onCancel: () => void;
}

function TransactionForm({
  initial,
  submitLabel,
  accounts,
  categories,
  tagSuggestions,
  onSubmit,
  onCancel,
}: TransactionFormProps) {
  const [draft, setDraft] = useState<TransactionDraft>(initial);
  const [errors, setErrors] = useState<TransactionDraftErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ids = {
    description: useId(),
    amount: useId(),
    date: useId(),
    account: useId(),
    target: useId(),
    category: useId(),
    status: useId(),
    tags: useId(),
    notes: useId(),
  };
  const kindCategories = categoriesOfKind(categories, draft.kind);
  const transfer = draft.kind === "transfer";

  const update = (patch: Partial<TransactionDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateTransactionDraft(draft);
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
          setDraft((current) =>
            changeKind(current, value as TransactionKind, indexById(categories)),
          );
        }}
      >
        <TabsList aria-label="Tipo do lançamento" className="w-full">
          {TRANSACTION_KINDS.map((kind) => (
            <TabsTrigger key={kind} value={kind} className="flex-1">
              {transactionKindLabels[kind]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Field label="Descrição *" htmlFor={ids.description} error={errors.description}>
        <Input
          id={ids.description}
          value={draft.description}
          maxLength={TRANSACTION_LIMITS.descriptionChars}
          autoFocus
          placeholder={descriptionPlaceholder[draft.kind]}
          aria-invalid={errors.description !== undefined || undefined}
          onChange={(event) => {
            update({ description: event.target.value });
          }}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor (R$) *" htmlFor={ids.amount} error={errors.amountText}>
          <Input
            id={ids.amount}
            value={draft.amountText}
            inputMode="decimal"
            placeholder="0,00"
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
            aria-invalid={errors.date !== undefined || undefined}
            onChange={(event) => {
              update({ date: event.target.value });
            }}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={transfer ? "De (conta) *" : "Conta *"}
          htmlFor={ids.account}
          error={errors.accountId}
        >
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

        {transfer ? (
          <Field label="Para (conta) *" htmlFor={ids.target} error={errors.transferAccountId}>
            <AccountSelect
              id={ids.target}
              accounts={accounts.filter((account) => account.id !== draft.accountId)}
              value={draft.transferAccountId}
              invalid={errors.transferAccountId !== undefined}
              onChange={(transferAccountId) => {
                update({ transferAccountId });
              }}
            />
          </Field>
        ) : (
          <Field label="Categoria" htmlFor={ids.category}>
            <Select
              value={draft.categoryId === null ? NO_CATEGORY : String(draft.categoryId)}
              onValueChange={(value) => {
                update({ categoryId: value === NO_CATEGORY ? null : Number(value) });
              }}
            >
              <SelectTrigger id={ids.category}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
                {kindCategories.map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    <ColorDot className={categoryDotClass[category.color]} />
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>

      <Field label="Status" htmlFor={ids.status}>
        <Select
          value={draft.status}
          onValueChange={(value) => {
            update({ status: value as TransactionStatus });
          }}
        >
          <SelectTrigger id={ids.status}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSACTION_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {statusLabel(draft.kind, status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Tags" htmlFor={ids.tags} error={errors.tags}>
        <TagInput
          id={ids.tags}
          value={draft.tags}
          onChange={(tags) => {
            update({ tags });
          }}
          merge={mergeTags}
          suggestions={tagSuggestions}
          maxTags={TRANSACTION_LIMITS.tags}
          invalid={errors.tags !== undefined}
        />
      </Field>

      <Field label="Observação" htmlFor={ids.notes} error={errors.notes}>
        <Textarea
          id={ids.notes}
          value={draft.notes}
          rows={2}
          maxLength={TRANSACTION_LIMITS.notesChars}
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

interface AccountSelectProps {
  id: string;
  accounts: readonly FinanceAccount[];
  value: number | null;
  invalid: boolean;
  onChange: (accountId: number) => void;
}

function AccountSelect({ id, accounts, value, invalid, onChange }: AccountSelectProps) {
  return (
    <Select
      value={value === null ? "" : String(value)}
      onValueChange={(next) => {
        onChange(Number(next));
      }}
    >
      <SelectTrigger id={id} aria-invalid={invalid || undefined}>
        <SelectValue placeholder="Escolha a conta" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={String(account.id)}>
            <ColorDot className={categoryDotClass[account.color]} />
            {account.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ColorDot({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("mr-2 inline-block size-2 rounded-full align-middle", className)}
    />
  );
}
