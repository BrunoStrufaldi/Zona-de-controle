import { Check, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { type SyntheticEvent, useId, useState } from "react";

import { ColorPicker } from "@/components/shared/color-picker";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDeleteDialog } from "@/features/finance/components/confirm-delete-dialog";
import { categoryDotClass } from "@/features/finance/components/finance-styles";
import {
  CATEGORY_LIMITS,
  categoriesOfKind,
  normalizeName,
  suggestColor,
  validateName,
} from "@/features/finance/domain/categories";
import {
  type CategoryInput,
  type CategoryUpdate,
  type CategoryKind,
  type FinanceCategory,
} from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { toServiceError } from "@/services/tauri/errors";

const KIND_TABS: readonly { kind: CategoryKind; label: string; noun: string }[] = [
  { kind: "expense", label: "Despesas", noun: "despesa" },
  { kind: "income", label: "Receitas", noun: "receita" },
];

interface FinanceCategoriesDialogProps {
  open: boolean;
  categories: readonly FinanceCategory[];
  /** Erros sobem para o formulário. */
  onCreate: (input: CategoryInput) => Promise<unknown>;
  onUpdate: (id: number, input: CategoryUpdate) => Promise<unknown>;
  /** Exclusão definitiva, chamada só após a confirmação. */
  onDelete: (category: FinanceCategory) => Promise<void>;
  onClose: () => void;
}

/** Categorias de despesa e de receita: criar, renomear, trocar a cor e excluir. */
export function FinanceCategoriesDialog({
  open,
  categories,
  onCreate,
  onUpdate,
  onDelete,
  onClose,
}: FinanceCategoriesDialogProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<FinanceCategory | null>(null);

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
          <DialogTitle>Categorias financeiras</DialogTitle>
          <DialogDescription>
            Cada lançamento pode ter uma categoria do mesmo tipo (despesa ou receita).
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="expense">
          <TabsList className="w-full">
            {KIND_TABS.map((tab) => (
              <TabsTrigger key={tab.kind} value={tab.kind} className="flex-1">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {KIND_TABS.map((tab) => {
            const ofKind = categoriesOfKind(categories, tab.kind);
            return (
              <TabsContent key={tab.kind} value={tab.kind} className="grid gap-4">
                {ofKind.length === 0 ? (
                  <EmptyState
                    icon={Tags}
                    title={`Nenhuma categoria de ${tab.noun}`}
                    className="py-6"
                  />
                ) : (
                  <ul className="grid gap-1.5" aria-label={`Categorias de ${tab.noun}`}>
                    {ofKind.map((category) =>
                      editingId === category.id ? (
                        <li key={category.id}>
                          <CategoryForm
                            initial={{ name: category.name, color: category.color }}
                            siblings={ofKind}
                            editingId={category.id}
                            kindLabel={tab.noun}
                            onSubmit={async (input) => {
                              await onUpdate(category.id, input);
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
                  <section
                    aria-label={`Nova categoria de ${tab.noun}`}
                    className="grid gap-2 border-t border-border pt-4"
                  >
                    <h3 className="text-sm font-medium">Nova categoria de {tab.noun}</h3>
                    <CategoryForm
                      key={ofKind.length}
                      initial={{ name: "", color: suggestColor(ofKind) }}
                      siblings={ofKind}
                      editingId={null}
                      kindLabel={tab.noun}
                      onSubmit={async (input) => {
                        await onCreate({ ...input, kind: tab.kind });
                      }}
                    />
                  </section>
                )}
              </TabsContent>
            );
          })}
        </Tabs>

        <ConfirmDeleteDialog
          item={deleting}
          title="Excluir categoria?"
          describe={(category) => (
            <>
              A categoria <strong className="text-foreground">“{category.name}”</strong> será
              excluída permanentemente.{" "}
              {category.transactionCount === 0
                ? "Nenhum lançamento usa esta categoria."
                : `${category.transactionCount} ${category.transactionCount === 1 ? "lançamento ficará" : "lançamentos ficarão"} sem categoria (os lançamentos não são excluídos).`}
            </>
          )}
          confirmLabel="Excluir categoria"
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
  category: FinanceCategory;
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
        {category.transactionCount} {category.transactionCount === 1 ? "lançamento" : "lançamentos"}
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
  initial: CategoryUpdate;
  /** Categorias do mesmo tipo (nomes únicos dentro do tipo). */
  siblings: readonly FinanceCategory[];
  editingId: number | null;
  kindLabel: string;
  onSubmit: (input: CategoryUpdate) => Promise<void>;
  onCancel?: () => void;
}

function CategoryForm({
  initial,
  siblings,
  editingId,
  kindLabel,
  onSubmit,
  onCancel,
}: CategoryFormProps) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errorId = useId();

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateName(
      draft.name,
      siblings,
      editingId,
      CATEGORY_LIMITS.nameChars,
      (name) => `Já existe uma categoria de ${kindLabel} chamada “${name}”.`,
    );
    setError(validation);
    if (validation !== null) return;

    setSaving(true);
    try {
      await onSubmit({ ...draft, name: normalizeName(draft.name) });
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
          {editingId === null ? "Adicionar" : "Salvar"}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="icon-sm" aria-label="Cancelar edição" onClick={onCancel}>
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
      <ColorPicker
        label="Cor da categoria"
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
