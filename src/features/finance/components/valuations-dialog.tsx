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
  formatQuantity,
  validateValuations,
  type ValuationDraft,
  valueStatusText,
} from "@/features/finance/domain/investments";
import { type InvestmentAsset, type ValuationInput } from "@/features/finance/types";
import { formatCents } from "@/lib/format";
import { toServiceError } from "@/services/tauri/errors";
import { type IsoDate } from "@/types/common";

export interface ValuationsTarget {
  /** Ativos a atualizar (um só, pelo menu do ativo, ou todos os em aberto). */
  assets: readonly InvestmentAsset[];
  date: IsoDate;
}

interface ValuationsDialogProps {
  /** `null` fecha o diálogo. */
  target: ValuationsTarget | null;
  onSubmit: (valuations: ValuationInput[]) => Promise<void>;
  onClose: () => void;
}

/** Valor atual informado pelo usuário (copiado do app do banco ou da corretora). */
export function ValuationsDialog({ target, onSubmit, onClose }: ValuationsDialogProps) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {target && (
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {target.assets.length === 1 ? "Informar valor atual" : "Atualizar valores"}
            </DialogTitle>
            <DialogDescription>
              Copie o valor bruto de cada ativo do app do banco ou da corretora. Deixe em branco o
              que não quiser atualizar; informar de novo no mesmo dia substitui.
            </DialogDescription>
          </DialogHeader>
          <ValuationsForm
            key={target.assets.map((asset) => asset.id).join(",")}
            target={target}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

interface ValuationsFormProps {
  target: ValuationsTarget;
  onSubmit: (valuations: ValuationInput[]) => Promise<void>;
  onCancel: () => void;
}

function ValuationsForm({ target, onSubmit, onCancel }: ValuationsFormProps) {
  const [date, setDate] = useState<IsoDate>(target.date);
  const [drafts, setDrafts] = useState<ValuationDraft[]>(
    target.assets.map((asset) => ({ assetId: asset.id, valueText: "" })),
  );
  const [errors, setErrors] = useState<Map<number, string>>(new Map());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dateId = useId();
  const prefix = useId();

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateValuations(drafts, date);
    setErrors(validation.errors);
    if (validation.errors.size > 0) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setSubmitError("Informe a data dos valores.");
      return;
    }
    if (validation.inputs.length === 0) {
      setSubmitError("Preencha ao menos um valor.");
      return;
    }
    setSaving(true);
    setSubmitError(null);
    try {
      await onSubmit(validation.inputs);
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
      <Field label="Data dos valores *" htmlFor={dateId}>
        <Input
          id={dateId}
          type="date"
          value={date}
          className="sm:w-48"
          onChange={(event) => {
            setDate(event.target.value);
          }}
        />
      </Field>

      <ul className="grid gap-3" aria-label="Valores dos ativos">
        {target.assets.map((asset, index) => {
          const id = `${prefix}-${asset.id}`;
          const error = errors.get(asset.id);
          return (
            <li key={asset.id} className="grid items-start gap-2 sm:grid-cols-[1fr_11rem]">
              <label htmlFor={id} className="grid min-w-0 gap-0.5">
                <span className="truncate text-sm font-medium">{asset.name}</span>
                <span className="text-xs text-muted-foreground">
                  Hoje: {formatCents(asset.position.value)} · {valueStatusText(asset.position)}
                  {asset.position.quantity !== null &&
                    asset.position.quantity > 0 &&
                    ` · ${formatQuantity(asset.position.quantity)} un.`}
                </span>
              </label>
              <div className="grid gap-1">
                <Input
                  id={id}
                  value={drafts[index]?.valueText ?? ""}
                  inputMode="decimal"
                  placeholder="R$ 0,00"
                  autoFocus={index === 0}
                  className="font-mono tabular"
                  aria-invalid={error !== undefined || undefined}
                  onChange={(event) => {
                    const valueText = event.target.value;
                    setDrafts((current) =>
                      current.map((draft) =>
                        draft.assetId === asset.id ? { ...draft, valueText } : draft,
                      ),
                    );
                  }}
                />
                {error && (
                  <p className="text-xs text-danger" role="alert">
                    {error}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

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
          {saving ? "Salvando…" : "Salvar valores"}
        </Button>
      </DialogFooter>
    </form>
  );
}
