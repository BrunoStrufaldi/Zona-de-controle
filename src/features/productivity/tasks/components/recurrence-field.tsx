import { Repeat } from "lucide-react";
import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/features/productivity/tasks/components/form-field";
import {
  defaultRecurrence,
  frequencyLabels,
  intervalUnit,
  MAX_RECURRENCE_INTERVAL,
  nextOccurrence,
} from "@/features/productivity/tasks/domain/recurrence";
import {
  RECURRENCE_FREQUENCIES,
  type RecurrenceFrequency,
  type TaskRecurrence,
} from "@/features/productivity/tasks/types";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { WEEKDAY_SHORT, weekdayLong } from "@/lib/weekdays";
import { type IsoDate } from "@/types/common";

const NO_REPEAT = "none";

interface RecurrenceFieldProps {
  value: TaskRecurrence | null;
  onChange: (value: TaskRecurrence | null) => void;
  dueDate: IsoDate | null;
  today: IsoDate;
  error?: string | undefined;
}

/** Seleção da frequência; os detalhes aparecem em `RecurrenceDetails`. */
export function RecurrenceSelect({ value, onChange, error }: RecurrenceFieldProps) {
  const id = useId();
  return (
    <Field label="Repetir" htmlFor={id}>
      <Select
        value={value?.frequency ?? NO_REPEAT}
        onValueChange={(next) => {
          if (next === NO_REPEAT) onChange(null);
          else
            onChange({
              ...(value ?? defaultRecurrence()),
              frequency: next as RecurrenceFrequency,
            });
        }}
      >
        <SelectTrigger id={id} aria-invalid={error !== undefined || undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_REPEAT}>Não repete</SelectItem>
          {RECURRENCE_FREQUENCIES.map((frequency) => (
            <SelectItem key={frequency} value={frequency}>
              {frequencyLabels[frequency]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** Intervalo, dias da semana e prévia da próxima ocorrência. */
export function RecurrenceDetails({
  value,
  onChange,
  dueDate,
  today,
  error,
}: RecurrenceFieldProps) {
  const intervalId = useId();
  const hintId = useId();
  if (value === null) return null;

  const update = (patch: Partial<TaskRecurrence>) => {
    onChange({ ...value, ...patch });
  };
  const toggleWeekday = (day: number) => {
    const weekdays = value.weekdays.includes(day)
      ? value.weekdays.filter((current) => current !== day)
      : [...value.weekdays, day].sort((a, b) => a - b);
    update({ weekdays });
  };
  const validInterval =
    Number.isInteger(value.interval) &&
    value.interval >= 1 &&
    value.interval <= MAX_RECURRENCE_INTERVAL;
  const preview = dueDate !== null && validInterval ? nextOccurrence(value, dueDate, today) : null;

  return (
    <div className="grid animate-fade-in gap-3 rounded-lg border border-border bg-raised/40 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Label htmlFor={intervalId}>A cada</Label>
        <Input
          id={intervalId}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_RECURRENCE_INTERVAL}
          value={Number.isNaN(value.interval) ? "" : value.interval}
          aria-invalid={error !== undefined || undefined}
          aria-describedby={hintId}
          className="h-8 w-16 font-mono tabular"
          onChange={(event) => {
            update({ interval: event.target.valueAsNumber });
          }}
        />
        <span className="text-muted-foreground">
          {intervalUnit(value.frequency, validInterval ? value.interval : 2)}
        </span>
      </div>

      {value.frequency === "weekly" && (
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground" id={`${hintId}-weekdays`}>
            Nos dias (nenhum = mesmo dia da semana do vencimento)
          </span>
          <div className="flex flex-wrap gap-1" role="group" aria-labelledby={`${hintId}-weekdays`}>
            {WEEKDAY_SHORT.map((label, day) => {
              const pressed = value.weekdays.includes(day);
              return (
                <button
                  key={label}
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
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p id={hintId} className="flex items-start gap-2 text-xs text-muted-foreground">
        <Repeat className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        {preview
          ? `Ao concluir hoje, a próxima ocorrência vencerá em ${formatDate(preview)}.`
          : "Ao concluir, a próxima ocorrência é criada automaticamente."}
      </p>
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
