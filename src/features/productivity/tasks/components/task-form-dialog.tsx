import { Save } from "lucide-react";
import { type SyntheticEvent, useId, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { ChecklistEditor } from "@/features/productivity/tasks/components/checklist-editor";
import { Field } from "@/features/productivity/tasks/components/form-field";
import {
  RecurrenceDetails,
  RecurrenceSelect,
} from "@/features/productivity/tasks/components/recurrence-field";
import { categoryDotClass } from "@/features/productivity/tasks/components/task-styles";
import { emptyTaskInput, toTaskInput } from "@/features/productivity/tasks/domain/input";
import { priorityLabels, statusLabels } from "@/features/productivity/tasks/domain/labels";
import {
  TASK_LIMITS,
  type TaskInputErrors,
  validateTaskInput,
} from "@/features/productivity/tasks/domain/validation";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskCategory,
  type TaskInput,
  type TaskPriority,
  type TaskRecurrence,
  type TaskStatus,
} from "@/features/productivity/tasks/types";
import { cn } from "@/lib/cn";
import { mergeTags } from "@/lib/tags";
import { toServiceError } from "@/services/tauri/errors";
import { type IsoDate } from "@/types/common";

const NO_CATEGORY = "none";

export type TaskFormMode = { kind: "create"; status?: TaskStatus } | { kind: "edit"; task: Task };

interface TaskFormDialogProps {
  /** `null` fecha o diálogo. */
  mode: TaskFormMode | null;
  tagSuggestions: readonly string[];
  categories: readonly TaskCategory[];
  today: IsoDate;
  onSubmit: (input: TaskInput) => Promise<void>;
  onClose: () => void;
}

function initialInput(mode: TaskFormMode): TaskInput {
  return mode.kind === "edit" ? toTaskInput(mode.task) : emptyTaskInput(mode.status);
}

export function TaskFormDialog({
  mode,
  tagSuggestions,
  categories,
  today,
  onSubmit,
  onClose,
}: TaskFormDialogProps) {
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
            <DialogTitle>{mode.kind === "edit" ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
            <DialogDescription>
              Campos com * são obrigatórios. Categorias e tags ajudam a filtrar depois.
            </DialogDescription>
          </DialogHeader>
          <TaskForm
            key={mode.kind === "edit" ? mode.task.id : "new"}
            initial={initialInput(mode)}
            submitLabel={mode.kind === "edit" ? "Salvar alterações" : "Criar tarefa"}
            tagSuggestions={tagSuggestions}
            categories={categories}
            today={today}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

interface TaskFormProps {
  initial: TaskInput;
  submitLabel: string;
  tagSuggestions: readonly string[];
  categories: readonly TaskCategory[];
  today: IsoDate;
  onSubmit: (input: TaskInput) => Promise<void>;
  onCancel: () => void;
}

function TaskForm({
  initial,
  submitLabel,
  tagSuggestions,
  categories,
  today,
  onSubmit,
  onCancel,
}: TaskFormProps) {
  const [draft, setDraft] = useState<TaskInput>(initial);
  const [errors, setErrors] = useState<TaskInputErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ids = {
    title: useId(),
    description: useId(),
    status: useId(),
    priority: useId(),
    due: useId(),
    category: useId(),
    checklist: useId(),
    tags: useId(),
  };

  const update = (patch: Partial<TaskInput>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  // Recorrência precisa de vencimento: ao ativá-la sem data, sugere hoje.
  const updateRecurrence = (recurrence: TaskRecurrence | null) => {
    setDraft((current) => ({
      ...current,
      recurrence,
      dueDate: recurrence !== null && current.dueDate === null ? today : current.dueDate,
    }));
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateTaskInput(draft);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    setSubmitError(null);
    try {
      await onSubmit({
        ...draft,
        title: draft.title.trim(),
        description: draft.description.trim(),
        checklist: draft.checklist
          .map((item) => ({ ...item, text: item.text.trim() }))
          .filter((item) => item.text !== ""),
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
      <Field label="Título *" htmlFor={ids.title} error={errors.title}>
        <Input
          id={ids.title}
          value={draft.title}
          maxLength={TASK_LIMITS.titleChars}
          autoFocus
          placeholder="O que precisa ser feito?"
          aria-invalid={errors.title !== undefined || undefined}
          onChange={(event) => {
            update({ title: event.target.value });
          }}
        />
      </Field>

      <Field label="Descrição" htmlFor={ids.description} error={errors.description}>
        <Textarea
          id={ids.description}
          value={draft.description}
          rows={4}
          maxLength={TASK_LIMITS.descriptionChars}
          placeholder="Detalhes, links, observações…"
          onChange={(event) => {
            update({ description: event.target.value });
          }}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Status" htmlFor={ids.status}>
          <Select
            value={draft.status}
            onValueChange={(value) => {
              update({ status: value as TaskStatus });
            }}
          >
            <SelectTrigger id={ids.status}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {statusLabels[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Prioridade" htmlFor={ids.priority}>
          <Select
            value={draft.priority}
            onValueChange={(value) => {
              update({ priority: value as TaskPriority });
            }}
          >
            <SelectTrigger id={ids.priority}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITIES.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {priorityLabels[priority]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Vencimento" htmlFor={ids.due}>
          <Input
            id={ids.due}
            type="date"
            value={draft.dueDate ?? ""}
            onChange={(event) => {
              update({ dueDate: event.target.value === "" ? null : event.target.value });
            }}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
              {categories.map((category) => (
                <SelectItem key={category.id} value={String(category.id)}>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mr-2 inline-block size-2 rounded-full align-middle",
                      categoryDotClass[category.color],
                    )}
                  />
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <RecurrenceSelect
          value={draft.recurrence}
          onChange={updateRecurrence}
          dueDate={draft.dueDate}
          today={today}
          error={errors.recurrence}
        />
      </div>

      <RecurrenceDetails
        value={draft.recurrence}
        onChange={updateRecurrence}
        dueDate={draft.dueDate}
        today={today}
        error={errors.recurrence}
      />

      <Field label="Checklist" htmlFor={ids.checklist} error={errors.checklist}>
        <ChecklistEditor
          id={ids.checklist}
          value={draft.checklist}
          onChange={(checklist) => {
            update({ checklist });
          }}
          invalid={errors.checklist !== undefined}
        />
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
          maxTags={TASK_LIMITS.tags}
          invalid={errors.tags !== undefined}
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
