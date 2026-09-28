import { RotateCcw, Save } from "lucide-react";
import { type SyntheticEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  parseThresholdsForm,
  sameThresholds,
  THRESHOLD_GROUPS,
  type ThresholdKey,
  type ThresholdsForm as ThresholdsFormValues,
  toThresholdsForm,
} from "@/features/system/diagnostics/domain/thresholds";
import {
  type DiagnosticSettings,
  type DiagnosticThresholds,
} from "@/features/system/diagnostics/types";
import { toServiceError } from "@/services/tauri/errors";

interface ThresholdsFormProps {
  settings: DiagnosticSettings;
  /** Grava e devolve os limites salvos. Erros do Rust aparecem no formulário. */
  onSave: (thresholds: DiagnosticThresholds) => Promise<DiagnosticSettings>;
}

export function ThresholdsForm({ settings, onSave }: ThresholdsFormProps) {
  const [saved, setSaved] = useState(settings.thresholds);
  const [values, setValues] = useState<ThresholdsFormValues>(() =>
    toThresholdsForm(settings.thresholds),
  );
  const [error, setError] = useState<{ key: ThresholdKey | null; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = parseThresholdsForm(values);
  const unchanged = parsed.ok && sameThresholds(parsed.thresholds, saved);
  const atDefaults = parsed.ok && sameThresholds(parsed.thresholds, settings.defaults);

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!parsed.ok) {
      setError({ key: parsed.key, message: parsed.error });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await onSave(parsed.thresholds);
      setSaved(result.thresholds);
      setValues(toThresholdsForm(result.thresholds));
    } catch (saveError) {
      setError({ key: null, message: toServiceError(saveError).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="grid gap-6"
      noValidate
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      {THRESHOLD_GROUPS.map((group) => (
        <fieldset key={group.title} className="grid gap-3">
          <legend className="mb-1 text-sm font-medium">{group.title}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {group.fields.map((field) => {
              const id = `threshold-${field.key}`;
              const invalid = error?.key === field.key;
              return (
                <div key={field.key} className="grid content-end gap-1.5">
                  <Label htmlFor={id} className="text-xs text-muted-foreground">
                    {field.label} ({field.unit})
                  </Label>
                  <Input
                    id={id}
                    inputMode="numeric"
                    value={values[field.key]}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? "thresholds-error" : undefined}
                    onChange={(event) => {
                      setValues((current) => ({ ...current, [field.key]: event.target.value }));
                    }}
                  />
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}

      {error && (
        <p id="thresholds-error" role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving || unchanged}>
          <Save aria-hidden="true" />
          {saving ? "Salvando…" : "Salvar limites"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving || atDefaults}
          onClick={() => {
            setError(null);
            setValues(toThresholdsForm(settings.defaults));
          }}
        >
          <RotateCcw aria-hidden="true" />
          Restaurar padrões
        </Button>
      </div>
    </form>
  );
}
