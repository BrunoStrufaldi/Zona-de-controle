import { Info, Save } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AccountSelect, ColorDot } from "@/features/finance/components/account-select";
import { categoryDotClass } from "@/features/finance/components/finance-styles";
import { categoriesOfKind } from "@/features/finance/domain/categories";
import { indexById } from "@/features/finance/domain/filters";
import { transactionKindLabels } from "@/features/finance/domain/labels";
import {
  emptyRecurringDraft,
  RECURRING_FREQUENCIES,
  RECURRING_LIMITS,
  type RecurringDraft,
  type RecurringDraftErrors,
  type RepeatEnd,
  toRecurringDraft,
  validateRecurringDraft,
} from "@/features/finance/domain/recurring";
import { changeKind } from "@/features/finance/domain/transaction-draft";
import {
  TRANSACTION_KINDS,
  type FinanceAccount,
  type FinanceCategory,
  type RecurringInput,
  type RecurringSeries,
  type TransactionKind,
} from "@/features/finance/types";
import { formatDate } from "@/lib/format";
import { frequencyLabels, intervalUnit } from "@/lib/recurrence";
import { toServiceError } from "@/services/tauri/errors";
import { type IsoDate } from "@/types/common";
import { type RecurrenceFrequency } from "@/types/recurrence";

const NO_CATEGORY = "none";

const descriptionPlaceholder: Record<TransactionKind, string> = {
  expense: "Ex.: Aluguel, Internet, Academia",
  income: "Ex.: Salário",
  transfer: "Ex.: Aporte mensal no Tesouro",
};

const endLabels: Record<RepeatEnd, string> = {
  never: "Sem data para acabar",
  until: "Até uma data",
  count: "Depois de algumas vezes",
};

export type RecurringFormMode =
  { kind: "create"; startDate: IsoDate } | { kind: "edit"; series: RecurringSeries };

interface RecurringFormDialogProps {
  /** `null` fecha o diálogo. */
  mode: RecurringFormMode | null;
  accounts: readonly FinanceAccount[];
  categories: readonly FinanceCategory[];
  /** Erros sobem para o formulário, que os exibe sem fechar. */
  onSubmit: (input: RecurringInput) => Promise<void>;
  onClose: () => void;
}

function initialDraft(mode: RecurringFormMode, accounts: readonly FinanceAccount[]) {
  if (mode.kind === "edit") return toRecurringDraft(mode.series);
  // Com uma conta só, ela já vem escolhida.
  return emptyRecurringDraft(
    accounts.length === 1 ? (accounts[0]?.id ?? null) : null,
    mode.startDate,
  );
}

export function RecurringFormDialog({
  mode,
  accounts,
  categories,
  onSubmit,
  onClose,
}: RecurringFormDialogProps) {
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
              {mode.kind === "edit" ? "Editar recorrente" : "Nova recorrente"}
            </DialogTitle>
            <DialogDescription>
              Contas fixas e receitas que se repetem. Os vencimentos aparecem sozinhos; o lançamento
              só é criado quando você registra o pagamento.
            </DialogDescription>
          </DialogHeader>
          <RecurringForm
            key={mode.kind === "edit" ? mode.series.id : "new"}
            initial={initialDraft(mode, accounts)}
            lastResolvedDate={mode.kind === "edit" ? mode.series.lastResolvedDate : null}
            submitLabel={mode.kind === "edit" ? "Salvar alterações" : "Criar recorrente"}
            accounts={accounts}
            categories={categories}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

interface RecurringFormProps {
  initial: RecurringDraft;
  /** Na edição: mudar a repetição só vale depois deste vencimento. */
  lastResolvedDate: IsoDate | null;
  submitLabel: string;
  accounts: readonly FinanceAccount[];
  categories: readonly FinanceCategory[];
  onSubmit: (input: RecurringInput) => Promise<void>;
  onCancel: () => void;
}

function RecurringForm({
  initial,
  lastResolvedDate,
  submitLabel,
  accounts,
  categories,
  onSubmit,
  onCancel,
}: RecurringFormProps) {
  const [draft, setDraft] = useState<RecurringDraft>(initial);
  const [errors, setErrors] = useState<RecurringDraftErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ids = {
    description: useId(),
    amount: useId(),
    account: useId(),
    target: useId(),
    category: useId(),
    start: useId(),
    frequency: useId(),
    interval: useId(),
    end: useId(),
    until: useId(),
    count: useId(),
    notes: useId(),
  };
  const kindCategories = categoriesOfKind(categories, draft.kind);
  const transfer = draft.kind === "transfer";

  const update = (patch: Partial<RecurringDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateRecurringDraft(draft);
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

  const interval = Number(draft.intervalText) || 1;

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
        <TabsList aria-label="Tipo da recorrente" className="w-full">
          {TRANSACTION_KINDS.map((kind) => (
            <TabsTrigger key={kind} value={kind} className="flex-1">
              {transactionKindLabels[kind]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <Field label="Descrição *" htmlFor={ids.description} error={errors.description}>
          <Input
            id={ids.description}
            value={draft.description}
            maxLength={RECURRING_LIMITS.descriptionChars}
            autoFocus
            placeholder={descriptionPlaceholder[draft.kind]}
            aria-invalid={errors.description !== undefined || undefined}
            onChange={(event) => {
              update({ description: event.target.value });
            }}
          />
        </Field>
        <Field label="Valor previsto (R$) *" htmlFor={ids.amount} error={errors.amountText}>
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

      <fieldset className="grid gap-4 rounded-md border border-border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Vencimentos</legend>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_7rem]">
          <Field label="Primeiro vencimento *" htmlFor={ids.start} error={errors.startDate}>
            <Input
              id={ids.start}
              type="date"
              value={draft.startDate}
              aria-invalid={errors.startDate !== undefined || undefined}
              onChange={(event) => {
                update({ startDate: event.target.value });
              }}
            />
          </Field>
          <Field label="Repete" htmlFor={ids.frequency}>
            <Select
              value={draft.frequency}
              onValueChange={(value) => {
                update({ frequency: value as RecurrenceFrequency });
              }}
            >
              <SelectTrigger id={ids.frequency}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECURRING_FREQUENCIES.map((frequency) => (
                  <SelectItem key={frequency} value={frequency}>
                    {frequencyLabels[frequency]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label={`A cada (${intervalUnit(draft.frequency, interval)})`}
            htmlFor={ids.interval}
            error={errors.intervalText}
          >
            <Input
              id={ids.interval}
              value={draft.intervalText}
              inputMode="numeric"
              className="font-mono tabular"
              aria-invalid={errors.intervalText !== undefined || undefined}
              onChange={(event) => {
                update({ intervalText: event.target.value });
              }}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Termina" htmlFor={ids.end}>
            <Select
              value={draft.end}
              onValueChange={(value) => {
                update({ end: value as RepeatEnd });
              }}
            >
              <SelectTrigger id={ids.end}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(endLabels) as RepeatEnd[]).map((end) => (
                  <SelectItem key={end} value={end}>
                    {endLabels[end]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {draft.end === "until" && (
            <Field label="Último vencimento até *" htmlFor={ids.until} error={errors.until}>
              <Input
                id={ids.until}
                type="date"
                value={draft.until}
                aria-invalid={errors.until !== undefined || undefined}
                onChange={(event) => {
                  update({ until: event.target.value });
                }}
              />
            </Field>
          )}
          {draft.end === "count" && (
            <Field label="Número de vencimentos *" htmlFor={ids.count} error={errors.countText}>
              <Input
                id={ids.count}
                value={draft.countText}
                inputMode="numeric"
                className="font-mono tabular"
                aria-invalid={errors.countText !== undefined || undefined}
                onChange={(event) => {
                  update({ countText: event.target.value });
                }}
              />
            </Field>
          )}
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {lastResolvedDate
            ? `Vencimentos registrados até ${formatDate(lastResolvedDate)} ficam no histórico. Para mudar a data ou a repetição, escolha um primeiro vencimento depois disso.`
            : "Mensal no dia 29, 30 ou 31 cai no último dia dos meses mais curtos. Assinatura com prazo? Use “Até uma data” para ser avisado perto do fim."}
        </p>
      </fieldset>

      <Field label="Observação" htmlFor={ids.notes} error={errors.notes}>
        <Textarea
          id={ids.notes}
          value={draft.notes}
          rows={2}
          maxLength={RECURRING_LIMITS.notesChars}
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
