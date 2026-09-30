import { Save, Trash2 } from "lucide-react";
import { type SyntheticEvent, useId, useState } from "react";

import { ColorPicker } from "@/components/shared/color-picker";
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
import { Textarea } from "@/components/ui/textarea";
import {
  DISPLAY_WEEKDAYS,
  PLAN_LIMITS,
  type PlanDraft,
  type PlanDraftErrors,
  toPlanInput,
  validateDraft,
} from "@/features/productivity/weekly-plan/domain/plan";
import { type PlanBlock, type PlanBlockInput } from "@/features/productivity/weekly-plan/types";
import { cn } from "@/lib/cn";
import { weekdayLong, weekdayShort } from "@/lib/weekdays";
import { toServiceError } from "@/services/tauri/errors";

export type PlanBlockFormMode =
  { kind: "create"; draft: PlanDraft } | { kind: "edit"; block: PlanBlock; draft: PlanDraft };

interface PlanBlockDialogProps {
  /** `null` fecha o diálogo. */
  mode: PlanBlockFormMode | null;
  onSubmit: (input: PlanBlockInput) => Promise<void>;
  onDelete: (block: PlanBlock) => void;
  onClose: () => void;
}

const WEEKDAY_PRESETS = [
  { label: "Seg a sex", days: [1, 2, 3, 4, 5] },
  { label: "Fim de semana", days: [0, 6] },
  { label: "Todo dia", days: [0, 1, 2, 3, 4, 5, 6] },
] as const;

export function PlanBlockDialog({ mode, onSubmit, onDelete, onClose }: PlanBlockDialogProps) {
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
            <DialogTitle>{mode.kind === "edit" ? "Editar bloco" : "Novo bloco"}</DialogTitle>
            <DialogDescription>
              Um bloco se repete nos dias escolhidos toda semana (ex.: “Faculdade”, seg a sex,
              18:30–22:30).
            </DialogDescription>
          </DialogHeader>
          <PlanBlockForm
            key={mode.kind === "edit" ? mode.block.id : "new"}
            initial={mode.draft}
            onSubmit={onSubmit}
            onCancel={onClose}
            onDelete={
              mode.kind === "edit"
                ? () => {
                    onDelete(mode.block);
                  }
                : undefined
            }
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

interface PlanBlockFormProps {
  initial: PlanDraft;
  onSubmit: (input: PlanBlockInput) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}

function PlanBlockForm({ initial, onSubmit, onCancel, onDelete }: PlanBlockFormProps) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<PlanDraftErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ids = {
    title: useId(),
    days: useId(),
    allDay: useId(),
    start: useId(),
    end: useId(),
    notes: useId(),
  };
  const update = (change: Partial<PlanDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
  };
  const hasDays = (days: readonly number[]) =>
    days.length === draft.weekdays.length && days.every((day) => draft.weekdays.includes(day));

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateDraft(draft);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;
    setSaving(true);
    setSubmitError(null);
    try {
      await onSubmit(toPlanInput(draft));
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
      <div className="grid gap-1.5">
        <Label htmlFor={ids.title}>Título *</Label>
        <Input
          id={ids.title}
          value={draft.title}
          maxLength={PLAN_LIMITS.titleChars}
          autoFocus
          placeholder="Ex.: Trabalho HomeOffice"
          aria-invalid={errors.title !== undefined || undefined}
          onChange={(event) => {
            update({ title: event.target.value });
          }}
        />
        {errors.title && <FieldError>{errors.title}</FieldError>}
      </div>

      <div className="grid gap-1.5">
        <span id={ids.days} className="text-sm font-medium">
          Dias *
        </span>
        <div role="group" aria-labelledby={ids.days} className="flex flex-wrap gap-1">
          {DISPLAY_WEEKDAYS.map((day) => (
            <button
              key={day}
              type="button"
              aria-pressed={draft.weekdays.includes(day)}
              aria-label={weekdayLong(day)}
              onClick={() => {
                update({
                  weekdays: draft.weekdays.includes(day)
                    ? draft.weekdays.filter((value) => value !== day)
                    : [...draft.weekdays, day],
                });
              }}
              className={cn(dayButtonClass(draft.weekdays.includes(day)), "capitalize")}
            >
              {weekdayShort(day)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {WEEKDAY_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              aria-pressed={hasDays(preset.days)}
              onClick={() => {
                update({ weekdays: [...preset.days] });
              }}
              className={dayButtonClass(hasDays(preset.days))}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {errors.weekdays && <FieldError>{errors.weekdays}</FieldError>}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={ids.allDay}
          checked={draft.allDay}
          onCheckedChange={(checked) => {
            update({ allDay: checked === true });
          }}
        />
        <Label htmlFor={ids.allDay}>Dia inteiro (anotação, sem horário)</Label>
      </div>

      {!draft.allDay && (
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={ids.start}>Início</Label>
            <Input
              id={ids.start}
              type="time"
              value={draft.startTime}
              aria-invalid={errors.time !== undefined || undefined}
              onChange={(event) => {
                update({ startTime: event.target.value });
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={ids.end}>Fim</Label>
            <Input
              id={ids.end}
              type="time"
              value={draft.endTime}
              aria-invalid={errors.time !== undefined || undefined}
              onChange={(event) => {
                update({ endTime: event.target.value });
              }}
            />
          </div>
          {errors.time && <FieldError className="col-span-2">{errors.time}</FieldError>}
        </div>
      )}

      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Cor</span>
        <ColorPicker
          label="Cor do bloco"
          value={draft.color}
          onChange={(color) => {
            update({ color });
          }}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={ids.notes}>Observação</Label>
        <Textarea
          id={ids.notes}
          value={draft.notes}
          maxLength={PLAN_LIMITS.notesChars}
          rows={2}
          placeholder="Ex.: academia fica aberta até 17h"
          onChange={(event) => {
            update({ notes: event.target.value });
          }}
        />
      </div>

      {submitError && (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/5 p-2 text-sm text-danger"
        >
          {submitError}
        </p>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        {onDelete ? (
          <Button type="button" variant="ghost" className="text-danger" onClick={onDelete}>
            <Trash2 aria-hidden="true" />
            Excluir
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            <Save aria-hidden="true" />
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

function FieldError({ children, className }: { children: string; className?: string }) {
  return (
    <p role="alert" className={cn("text-xs text-danger", className)}>
      {children}
    </p>
  );
}

function dayButtonClass(pressed: boolean): string {
  return cn(
    "h-8 min-w-11 cursor-pointer rounded-md border px-2 text-xs transition-colors",
    pressed
      ? "border-primary bg-primary/15 text-primary"
      : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
  );
}
