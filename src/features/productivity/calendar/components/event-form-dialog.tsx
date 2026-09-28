import { AlertTriangle, Save } from "lucide-react";
import { type ReactNode, type SyntheticEvent, useId, useState } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  changesOccurrenceDates,
  draftFromEvent,
  draftFromOccurrence,
  EVENT_LIMITS,
  type EventDraft,
  type EventDraftErrors,
  newEventDraft,
  normalizeReminder,
  reminderChoices,
  reminderLabel,
  type RepeatEnd,
  toEventInput,
  validateEventDraft,
  withStart,
} from "@/features/productivity/calendar/domain/input";
import { type CalendarEvent, type EventOccurrence } from "@/features/productivity/calendar/types";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { frequencyLabels, intervalUnit } from "@/lib/recurrence";
import { WEEKDAYS, weekdayLong, weekdayShort } from "@/lib/weekdays";
import { toServiceError } from "@/services/tauri/errors";
import { type IsoDate } from "@/types/common";
import { RECURRENCE_FREQUENCIES, type RecurrenceFrequency } from "@/types/recurrence";

export type EventFormMode =
  | { kind: "create"; date: IsoDate; hour?: number }
  | { kind: "series"; event: CalendarEvent }
  | { kind: "occurrence"; event: CalendarEvent; occurrence: EventOccurrence };

interface EventFormDialogProps {
  /** `null` fecha o diálogo. */
  mode: EventFormMode | null;
  /** Recebe o formulário já validado; erros sobem para o formulário, que os exibe. */
  onSubmit: (draft: EventDraft) => Promise<void>;
  onClose: () => void;
}

const TITLES: Record<EventFormMode["kind"], string> = {
  create: "Novo evento",
  series: "Editar evento",
  occurrence: "Editar esta ocorrência",
};

function initialDraft(mode: EventFormMode): EventDraft {
  switch (mode.kind) {
    case "create":
      return newEventDraft(mode.date, mode.hour);
    case "series":
      return draftFromEvent(mode.event);
    case "occurrence":
      return draftFromOccurrence(mode.occurrence);
  }
}

function modeKey(mode: EventFormMode): string {
  switch (mode.kind) {
    case "create":
      return `new-${mode.date}-${mode.hour ?? ""}`;
    case "series":
      return `series-${mode.event.id}`;
    case "occurrence":
      return `occurrence-${mode.event.id}-${mode.occurrence.occurrenceDate}`;
  }
}

export function EventFormDialog({ mode, onSubmit, onClose }: EventFormDialogProps) {
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
            <DialogTitle>{TITLES[mode.kind]}</DialogTitle>
            <DialogDescription>
              {mode.kind === "occurrence"
                ? `As alterações valem só para a ocorrência de ${formatDate(mode.occurrence.occurrenceDate)}.`
                : "Eventos ficam só neste computador. Lembretes aparecem enquanto o app estiver aberto."}
            </DialogDescription>
          </DialogHeader>
          <EventForm key={modeKey(mode)} mode={mode} onSubmit={onSubmit} onCancel={onClose} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-xs text-danger">
      {children}
    </p>
  );
}

interface EventFormProps {
  mode: EventFormMode;
  onSubmit: (draft: EventDraft) => Promise<void>;
  onCancel: () => void;
}

function EventForm({ mode, onSubmit, onCancel }: EventFormProps) {
  const [draft, setDraft] = useState<EventDraft>(() => initialDraft(mode));
  const [errors, setErrors] = useState<EventDraftErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ids = {
    title: useId(),
    allDay: useId(),
    startDate: useId(),
    startTime: useId(),
    endDate: useId(),
    endTime: useId(),
    reminder: useId(),
    repeat: useId(),
    location: useId(),
    description: useId(),
  };
  const withRecurrence = mode.kind !== "occurrence";
  const series = mode.kind === "series" ? mode.event : null;
  const resetsExceptions =
    series !== null && series.exceptions > 0 && changesOccurrenceDates(series, toEventInput(draft));

  const update = (patch: Partial<EventDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateEventDraft(draft, withRecurrence);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    setSubmitError(null);
    try {
      await onSubmit(draft);
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
          maxLength={EVENT_LIMITS.titleChars}
          autoFocus
          placeholder="Ex.: Consulta no dentista"
          aria-invalid={errors.title !== undefined || undefined}
          onChange={(event) => {
            update({ title: event.target.value });
          }}
        />
        {errors.title && <FieldError>{errors.title}</FieldError>}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={ids.allDay}
          checked={draft.allDay}
          onCheckedChange={(checked) => {
            const allDay = checked === true;
            update({ allDay, reminderMinutes: normalizeReminder(draft.reminderMinutes, allDay) });
          }}
        />
        <Label htmlFor={ids.allDay}>Dia inteiro</Label>
      </div>

      <div className="grid gap-3">
        <div className="grid content-start gap-1.5">
          <Label htmlFor={ids.startDate}>Início</Label>
          <div className="flex min-w-0 gap-2">
            <Input
              id={ids.startDate}
              type="date"
              className="min-w-0 flex-1"
              value={draft.startDate}
              aria-invalid={errors.start !== undefined || undefined}
              onChange={(event) => {
                setDraft((current) => withStart(current, event.target.value, current.startTime));
              }}
            />
            {!draft.allDay && (
              <Input
                id={ids.startTime}
                type="time"
                aria-label="Horário de início"
                value={draft.startTime}
                className="w-32 shrink-0"
                onChange={(event) => {
                  setDraft((current) => withStart(current, current.startDate, event.target.value));
                }}
              />
            )}
          </div>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={ids.endDate}>Término</Label>
          <div className="flex min-w-0 gap-2">
            <Input
              id={ids.endDate}
              type="date"
              className="min-w-0 flex-1"
              value={draft.endDate}
              min={draft.startDate}
              aria-invalid={errors.end !== undefined || undefined}
              onChange={(event) => {
                update({ endDate: event.target.value });
              }}
            />
            {!draft.allDay && (
              <Input
                id={ids.endTime}
                type="time"
                aria-label="Horário de término"
                value={draft.endTime}
                className="w-32 shrink-0"
                onChange={(event) => {
                  update({ endTime: event.target.value });
                }}
              />
            )}
          </div>
        </div>
      </div>
      {(errors.start ?? errors.end) && <FieldError>{errors.start ?? errors.end}</FieldError>}

      <div className={cn("grid gap-3", withRecurrence && "sm:grid-cols-2")}>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={ids.reminder}>Lembrete</Label>
          <Select
            value={draft.reminderMinutes === null ? "none" : String(draft.reminderMinutes)}
            onValueChange={(value) => {
              update({ reminderMinutes: value === "none" ? null : Number(value) });
            }}
          >
            <SelectTrigger id={ids.reminder}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{reminderLabel(null, draft.allDay)}</SelectItem>
              {reminderChoices(draft.allDay, draft.reminderMinutes).map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>
                  {reminderLabel(minutes, draft.allDay)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {withRecurrence && (
          <div className="grid content-start gap-1.5">
            <Label htmlFor={ids.repeat}>Repetir</Label>
            <Select
              value={draft.repeat ?? "none"}
              onValueChange={(value) => {
                update({ repeat: value === "none" ? null : (value as RecurrenceFrequency) });
              }}
            >
              <SelectTrigger id={ids.repeat}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não repete</SelectItem>
                {RECURRENCE_FREQUENCIES.map((frequency) => (
                  <SelectItem key={frequency} value={frequency}>
                    {frequencyLabels[frequency]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {withRecurrence && draft.repeat !== null && (
        <RepeatDetails draft={draft} errors={errors} onChange={update} />
      )}

      {resetsExceptions && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
        >
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          Mudar o início ou a repetição descarta{" "}
          {series.exceptions === 1
            ? "a alteração feita em 1 ocorrência"
            : `as alterações feitas em ${series.exceptions} ocorrências`}{" "}
          (edições e exclusões individuais). O descarte fica registrado no log de auditoria.
        </p>
      )}

      {withRecurrence && (
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Cor</span>
          <ColorPicker
            label="Cor do evento"
            value={draft.color}
            onChange={(color) => {
              update({ color });
            }}
          />
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor={ids.location}>Local</Label>
        <Input
          id={ids.location}
          value={draft.location}
          maxLength={EVENT_LIMITS.locationChars}
          placeholder="Opcional"
          onChange={(event) => {
            update({ location: event.target.value });
          }}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={ids.description}>Descrição</Label>
        <Textarea
          id={ids.description}
          value={draft.description}
          maxLength={EVENT_LIMITS.descriptionChars}
          rows={3}
          placeholder="Opcional"
          onChange={(event) => {
            update({ description: event.target.value });
          }}
        />
      </div>

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
          {saving ? "Salvando…" : mode.kind === "create" ? "Criar evento" : "Salvar alterações"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const REPEAT_ENDS: readonly { value: RepeatEnd; label: string }[] = [
  { value: "never", label: "Nunca" },
  { value: "until", label: "Em uma data" },
  { value: "count", label: "Após algumas vezes" },
];

interface RepeatDetailsProps {
  draft: EventDraft;
  errors: EventDraftErrors;
  onChange: (patch: Partial<EventDraft>) => void;
}

/** Intervalo, dias da semana e término da repetição. */
function RepeatDetails({ draft, errors, onChange }: RepeatDetailsProps) {
  const intervalId = useId();
  const weekdaysId = useId();
  const endId = useId();
  const frequency = draft.repeat ?? "weekly";
  const validInterval = Number.isInteger(draft.interval) && draft.interval >= 1;

  const toggleWeekday = (day: number) => {
    onChange({
      weekdays: draft.weekdays.includes(day)
        ? draft.weekdays.filter((current) => current !== day)
        : [...draft.weekdays, day].sort((a, b) => a - b),
    });
  };

  return (
    <div className="grid animate-fade-in gap-3 rounded-lg border border-border bg-raised/40 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Label htmlFor={intervalId}>A cada</Label>
        <Input
          id={intervalId}
          type="number"
          inputMode="numeric"
          min={1}
          max={EVENT_LIMITS.interval}
          value={Number.isNaN(draft.interval) ? "" : draft.interval}
          aria-invalid={errors.interval !== undefined || undefined}
          className="h-8 w-16 font-mono tabular"
          onChange={(event) => {
            onChange({ interval: event.target.valueAsNumber });
          }}
        />
        <span className="text-muted-foreground">
          {intervalUnit(frequency, validInterval ? draft.interval : 2)}
        </span>
      </div>
      {errors.interval && <FieldError>{errors.interval}</FieldError>}

      {frequency === "weekly" && (
        <div className="grid gap-1.5">
          <span id={weekdaysId} className="text-xs text-muted-foreground">
            Nos dias (nenhum = mesmo dia da semana do início)
          </span>
          <div role="group" aria-labelledby={weekdaysId} className="flex flex-wrap gap-1">
            {WEEKDAYS.map((day) => {
              const pressed = draft.weekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={pressed}
                  aria-label={weekdayLong(day)}
                  onClick={() => {
                    toggleWeekday(day);
                  }}
                  className={cn(
                    "h-7 min-w-10 cursor-pointer rounded-md border px-2 text-xs capitalize transition-colors",
                    pressed
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
                  )}
                >
                  {weekdayShort(day)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-1.5">
        <span id={endId} className="text-xs text-muted-foreground">
          Termina
        </span>
        <div role="radiogroup" aria-labelledby={endId} className="flex flex-wrap gap-1">
          {REPEAT_ENDS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={draft.repeatEnd === value}
              onClick={() => {
                onChange({ repeatEnd: value });
              }}
              className={cn(
                "h-7 cursor-pointer rounded-md border px-2.5 text-xs transition-colors",
                draft.repeatEnd === value
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {draft.repeatEnd === "until" && (
          <Input
            type="date"
            aria-label="Repetir até"
            value={draft.until}
            min={draft.startDate}
            aria-invalid={errors.until !== undefined || undefined}
            className="h-8 w-44"
            onChange={(event) => {
              onChange({ until: event.target.value });
            }}
          />
        )}
        {draft.repeatEnd === "count" && (
          <div className="flex items-center gap-2 text-sm">
            <Input
              type="number"
              inputMode="numeric"
              aria-label="Número de vezes"
              min={1}
              max={EVENT_LIMITS.count}
              value={Number.isNaN(draft.count) ? "" : draft.count}
              aria-invalid={errors.count !== undefined || undefined}
              className="h-8 w-20 font-mono tabular"
              onChange={(event) => {
                onChange({ count: event.target.valueAsNumber });
              }}
            />
            <span className="text-muted-foreground">{draft.count === 1 ? "vez" : "vezes"}</span>
          </div>
        )}
        {(errors.until ?? errors.count) && <FieldError>{errors.until ?? errors.count}</FieldError>}
      </div>
    </div>
  );
}
