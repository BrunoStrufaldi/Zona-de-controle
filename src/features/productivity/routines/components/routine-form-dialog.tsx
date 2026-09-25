import { ArrowDown, ArrowUp, Plus, Save, X } from "lucide-react";
import { type SyntheticEvent, useId, useState } from "react";

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
import { Label } from "@/components/ui/label";
import {
  ROUTINE_LIMITS,
  type RoutineInputErrors,
  toRoutineInput,
  validateRoutineInput,
} from "@/features/productivity/routines/domain/routines";
import {
  type HabitInput,
  type Routine,
  type RoutineInput,
} from "@/features/productivity/routines/types";
import { cn } from "@/lib/cn";
import { WEEKDAYS, weekdayLong, weekdayShort } from "@/lib/weekdays";
import { toServiceError } from "@/services/tauri/errors";

export type RoutineFormMode = { kind: "create" } | { kind: "edit"; routine: Routine };

interface RoutineFormDialogProps {
  /** `null` fecha o diálogo. */
  mode: RoutineFormMode | null;
  routines: readonly Routine[];
  onSubmit: (input: RoutineInput) => Promise<void>;
  onClose: () => void;
}

export function RoutineFormDialog({ mode, routines, onSubmit, onClose }: RoutineFormDialogProps) {
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
            <DialogTitle>{mode.kind === "edit" ? "Editar rotina" : "Nova rotina"}</DialogTitle>
            <DialogDescription>
              Uma rotina agrupa hábitos feitos nos mesmos dias (ex.: “Rotina matinal”).
            </DialogDescription>
          </DialogHeader>
          <RoutineForm
            key={mode.kind === "edit" ? mode.routine.id : "new"}
            routine={mode.kind === "edit" ? mode.routine : null}
            routines={routines}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

interface RoutineFormProps {
  routine: Routine | null;
  routines: readonly Routine[];
  onSubmit: (input: RoutineInput) => Promise<void>;
  onCancel: () => void;
}

function RoutineForm({ routine, routines, onSubmit, onCancel }: RoutineFormProps) {
  const [draft, setDraft] = useState<RoutineInput>(() => toRoutineInput(routine));
  const [errors, setErrors] = useState<RoutineInputErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ids = { name: useId(), days: useId(), habits: useId() };
  const everyDay = draft.weekdays.length === WEEKDAYS.length;

  const setHabits = (habits: HabitInput[]) => {
    setDraft((current) => ({ ...current, habits }));
  };
  const moveHabit = (index: number, offset: number) => {
    const habits = [...draft.habits];
    const [moved] = habits.splice(index, 1);
    if (moved) habits.splice(index + offset, 0, moved);
    setHabits(habits);
  };
  const toggleDay = (day: number) => {
    setDraft((current) => ({
      ...current,
      weekdays: current.weekdays.includes(day)
        ? current.weekdays.filter((value) => value !== day)
        : [...current.weekdays, day].sort((a, b) => a - b),
    }));
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateRoutineInput(draft, routines, routine?.id ?? null);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    setSubmitError(null);
    try {
      await onSubmit({
        ...draft,
        name: draft.name.trim(),
        habits: draft.habits
          .map((habit) => ({ ...habit, name: habit.name.trim() }))
          .filter((habit) => habit.name !== ""),
      });
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
        <Label htmlFor={ids.name}>Nome *</Label>
        <Input
          id={ids.name}
          value={draft.name}
          maxLength={ROUTINE_LIMITS.nameChars}
          autoFocus
          placeholder="Ex.: Rotina matinal"
          aria-invalid={errors.name !== undefined || undefined}
          onChange={(event) => {
            setDraft((current) => ({ ...current, name: event.target.value }));
          }}
        />
        {errors.name && (
          <p role="alert" className="text-xs text-danger">
            {errors.name}
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <span id={ids.days} className="text-sm font-medium">
          Dias
        </span>
        <div role="group" aria-labelledby={ids.days} className="flex flex-wrap gap-1">
          <button
            type="button"
            aria-pressed={everyDay}
            onClick={() => {
              setDraft((current) => ({
                ...current,
                weekdays: everyDay ? [] : [...WEEKDAYS],
              }));
            }}
            className={dayButtonClass(everyDay)}
          >
            Todo dia
          </button>
          {WEEKDAYS.map((day) => (
            <button
              key={day}
              type="button"
              aria-pressed={draft.weekdays.includes(day)}
              aria-label={weekdayLong(day)}
              onClick={() => {
                toggleDay(day);
              }}
              className={cn(dayButtonClass(draft.weekdays.includes(day)), "capitalize")}
            >
              {weekdayShort(day)}
            </button>
          ))}
        </div>
        {errors.weekdays && (
          <p role="alert" className="text-xs text-danger">
            {errors.weekdays}
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <span id={ids.habits} className="text-sm font-medium">
          Hábitos *
        </span>
        <ul className="grid gap-1.5" aria-labelledby={ids.habits}>
          {draft.habits.map((habit, index) => (
            <li key={habit.id ?? `new-${index}`} className="flex items-center gap-1.5">
              <Input
                value={habit.name}
                maxLength={ROUTINE_LIMITS.nameChars}
                placeholder="Ex.: Beber um copo de água"
                aria-label={`Hábito ${index + 1}`}
                className="h-8"
                onChange={(event) => {
                  setHabits(
                    draft.habits.map((current, position) =>
                      position === index ? { ...current, name: event.target.value } : current,
                    ),
                  );
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Subir hábito ${index + 1}`}
                disabled={index === 0}
                onClick={() => {
                  moveHabit(index, -1);
                }}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Descer hábito ${index + 1}`}
                disabled={index === draft.habits.length - 1}
                onClick={() => {
                  moveHabit(index, 1);
                }}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remover hábito ${index + 1}`}
                onClick={() => {
                  setHabits(draft.habits.filter((_, position) => position !== index));
                }}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          size="sm"
          className="justify-self-start"
          disabled={draft.habits.length >= ROUTINE_LIMITS.habits}
          onClick={() => {
            setHabits([...draft.habits, { id: null, name: "" }]);
          }}
        >
          <Plus aria-hidden="true" />
          Adicionar hábito
        </Button>
        {routine && (
          <p className="text-xs text-muted-foreground">
            Hábitos removidos saem da rotina a partir de hoje; o histórico dos dias anteriores é
            mantido. Hábitos novos contam a partir de hoje.
          </p>
        )}
        {errors.habits && (
          <p role="alert" className="text-xs text-danger">
            {errors.habits}
          </p>
        )}
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
          {saving ? "Salvando…" : routine ? "Salvar alterações" : "Criar rotina"}
        </Button>
      </DialogFooter>
    </form>
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
