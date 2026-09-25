import { Check, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { type SyntheticEvent, useId, useState } from "react";

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
import { DeleteCategoryDialog } from "@/features/productivity/tasks/components/delete-category-dialog";
import { categoryDotClass } from "@/features/productivity/tasks/components/task-styles";
import {
  CATEGORY_LIMITS,
  categoryColorLabels,
  normalizeCategoryName,
  suggestCategoryColor,
  validateCategoryInput,
} from "@/features/productivity/tasks/domain/categories";
import {
  CATEGORY_COLORS,
  type CategoryColor,
  type TaskCategory,
  type TaskCategoryInput,
} from "@/features/productivity/tasks/types";
import { cn } from "@/lib/cn";
import { toServiceError } from "@/services/tauri/errors";

interface CategoriesDialogProps {
  open: boolean;
  categories: readonly TaskCategory[];
  /** Cria (`id` nulo) ou edita. Erros sobem para o formulário. */
  onSave: (id: number | null, input: TaskCategoryInput) => Promise<unknown>;
  /** Exclusão definitiva, chamada só após a confirmação. */
  onDelete: (category: TaskCategory) => Promise<void>;
  onClose: () => void;
}

/** Gestão das categorias: criar, renomear, trocar a cor e excluir. */
export function CategoriesDialog({
  open,
  categories,
  onSave,
  onDelete,
  onClose,
}: CategoriesDialogProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<TaskCategory | null>(null);

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
          <DialogTitle>Categorias</DialogTitle>
          <DialogDescription>
            Agrupe tarefas por área da vida. Cada tarefa pode ter uma categoria.
          </DialogDescription>
        </DialogHeader>

        {categories.length === 0 ? (
          <EmptyState
            icon={Tags}
            title="Nenhuma categoria ainda"
            description="Crie a primeira abaixo (ex.: Trabalho, Casa, Estudos)."
            className="py-6"
          />
        ) : (
          <ul className="grid gap-1.5" aria-label="Categorias">
            {categories.map((category) =>
              editingId === category.id ? (
                <li key={category.id}>
                  <CategoryForm
                    initial={{ name: category.name, color: category.color }}
                    categories={categories}
                    editingId={category.id}
                    submitLabel="Salvar"
                    onSubmit={async (input) => {
                      await onSave(category.id, input);
                      setEditingId(null);
                    }}
                    onCancel={() => {
                      setEditingId(null);
                    }}
                  />
                </li>
              ) : (
                <CategoryRow
                  key={category.id}
                  category={category}
                  onEdit={() => {
                    setEditingId(category.id);
                  }}
                  onDelete={() => {
                    setDeleting(category);
                  }}
                />
              ),
            )}
          </ul>
        )}

        {categories.length < CATEGORY_LIMITS.categories && (
          <section aria-label="Nova categoria" className="grid gap-2 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Nova categoria</h3>
            <CategoryForm
              // Recria o formulário para sugerir outra cor após cada criação.
              key={categories.length}
              initial={{ name: "", color: suggestCategoryColor(categories) }}
              categories={categories}
              editingId={null}
              submitLabel="Adicionar"
              onSubmit={async (input) => {
                await onSave(null, input);
              }}
            />
          </section>
        )}

        <DeleteCategoryDialog
          category={deleting}
          onConfirm={async (category) => {
            await onDelete(category);
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

interface CategoryRowProps {
  category: TaskCategory;
  onEdit: () => void;
  onDelete: () => void;
}

function CategoryRow({ category, onEdit, onDelete }: CategoryRowProps) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-raised/40 px-3 py-2">
      <span
        aria-hidden="true"
        className={cn("size-2.5 shrink-0 rounded-full", categoryDotClass[category.color])}
      />
      <span className="min-w-0 flex-1 truncate text-sm">{category.name}</span>
      <span className="font-mono text-xs text-muted-foreground tabular">
        {category.taskCount} {category.taskCount === 1 ? "tarefa" : "tarefas"}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Editar categoria “${category.name}”`}
        onClick={onEdit}
      >
        <Pencil aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-danger hover:text-danger"
        aria-label={`Excluir categoria “${category.name}”`}
        onClick={onDelete}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </li>
  );
}

interface CategoryFormProps {
  initial: TaskCategoryInput;
  categories: readonly TaskCategory[];
  editingId: number | null;
  submitLabel: string;
  onSubmit: (input: TaskCategoryInput) => Promise<void>;
  onCancel?: () => void;
}

function CategoryForm({
  initial,
  categories,
  editingId,
  submitLabel,
  onSubmit,
  onCancel,
}: CategoryFormProps) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameId = useId();
  const errorId = useId();

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateCategoryInput(draft, categories, editingId);
    setError(validation);
    if (validation !== null) return;

    setSaving(true);
    try {
      await onSubmit({ ...draft, name: normalizeCategoryName(draft.name) });
      if (editingId === null) setDraft((current) => ({ ...current, name: "" }));
    } catch (submitError) {
      setError(toServiceError(submitError).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      noValidate
      className="grid gap-2 rounded-md border border-border p-3"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          id={nameId}
          value={draft.name}
          maxLength={CATEGORY_LIMITS.nameChars}
          placeholder="Nome da categoria"
          aria-label="Nome da categoria"
          aria-invalid={error !== null || undefined}
          aria-describedby={error ? errorId : undefined}
          autoFocus={editingId !== null}
          className="h-8"
          onChange={(event) => {
            setDraft((current) => ({ ...current, name: event.target.value }));
          }}
        />
        <Button type="submit" size="sm" disabled={saving}>
          {editingId === null ? <Plus aria-hidden="true" /> : <Check aria-hidden="true" />}
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="icon-sm" aria-label="Cancelar edição" onClick={onCancel}>
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
      <ColorPicker
        value={draft.color}
        onChange={(color) => {
          setDraft((current) => ({ ...current, color }));
        }}
      />
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: CategoryColor;
  onChange: (color: CategoryColor) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Cor da categoria" className="flex flex-wrap gap-1.5">
      {CATEGORY_COLORS.map((color) => {
        const selected = color === value;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={categoryColorLabels[color]}
            title={categoryColorLabels[color]}
            onClick={() => {
              onChange(color);
            }}
            className={cn(
              "flex size-6 cursor-pointer items-center justify-center rounded-full border-2 transition-[border-color,transform] duration-150 hover:scale-110",
              selected ? "border-foreground" : "border-transparent",
            )}
          >
            <span className={cn("size-4 rounded-full", categoryDotClass[color])} />
          </button>
        );
      })}
    </div>
  );
}
