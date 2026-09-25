import { Check, FolderPlus, Folders, Pencil, Plus, Trash2, X } from "lucide-react";
import { type SyntheticEvent, useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  NOTE_LIMITS,
  normalizeFolderName,
  validateFolderName,
} from "@/features/productivity/notes/domain/notes";
import { type NoteFolder } from "@/features/productivity/notes/types";
import { toServiceError } from "@/services/tauri/errors";

interface FoldersDialogProps {
  open: boolean;
  folders: readonly NoteFolder[];
  /** Notas por pasta (calculado das notas carregadas). */
  noteCounts: ReadonlyMap<number, number>;
  /** Cria (`id` nulo) ou renomeia. Erros sobem para o formulário. */
  onSave: (id: number | null, name: string) => Promise<unknown>;
  /** Exclusão definitiva, chamada só após a confirmação. */
  onDelete: (folder: NoteFolder) => Promise<void>;
  onClose: () => void;
}

/** Gestão das pastas de notas: criar, renomear e excluir. */
export function FoldersDialog({
  open,
  folders,
  noteCounts,
  onSave,
  onDelete,
  onClose,
}: FoldersDialogProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<NoteFolder | null>(null);

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
          <DialogTitle>Pastas</DialogTitle>
          <DialogDescription>
            Organize as notas por assunto. Excluir uma pasta não exclui as notas: elas ficam em “Sem
            pasta”.
          </DialogDescription>
        </DialogHeader>

        {folders.length === 0 ? (
          <EmptyState
            icon={Folders}
            title="Nenhuma pasta ainda"
            description="Crie a primeira abaixo (ex.: Trabalho, Estudos, Receitas)."
            className="py-6"
          />
        ) : (
          <ul className="grid gap-1.5" aria-label="Pastas">
            {folders.map((folder) => {
              const count = noteCounts.get(folder.id) ?? 0;
              return editingId === folder.id ? (
                <li key={folder.id}>
                  <FolderForm
                    initial={folder.name}
                    folders={folders}
                    editingId={folder.id}
                    onSubmit={async (name) => {
                      await onSave(folder.id, name);
                      setEditingId(null);
                    }}
                    onCancel={() => {
                      setEditingId(null);
                    }}
                  />
                </li>
              ) : (
                <li
                  key={folder.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-raised/40 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{folder.name}</span>
                  <span className="font-mono text-xs text-muted-foreground tabular">
                    {count} {count === 1 ? "nota" : "notas"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Renomear pasta “${folder.name}”`}
                    onClick={() => {
                      setEditingId(folder.id);
                    }}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-danger hover:text-danger"
                    aria-label={`Excluir pasta “${folder.name}”`}
                    onClick={() => {
                      setDeleting(folder);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {folders.length < NOTE_LIMITS.folders && (
          <section aria-label="Nova pasta" className="grid gap-2 border-t border-border pt-4">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <FolderPlus className="size-4" aria-hidden="true" />
              Nova pasta
            </h3>
            <FolderForm
              initial=""
              folders={folders}
              editingId={null}
              onSubmit={async (name) => {
                await onSave(null, name);
              }}
            />
          </section>
        )}

        <DeleteFolderDialog
          folder={deleting}
          noteCount={deleting ? (noteCounts.get(deleting.id) ?? 0) : 0}
          onConfirm={async (folder) => {
            await onDelete(folder);
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

interface FolderFormProps {
  initial: string;
  folders: readonly NoteFolder[];
  editingId: number | null;
  onSubmit: (name: string) => Promise<void>;
  onCancel?: () => void;
}

function FolderForm({ initial, folders, editingId, onSubmit, onCancel }: FolderFormProps) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateFolderName(name, folders, editingId);
    setError(validation);
    if (validation !== null) return;

    setSaving(true);
    try {
      await onSubmit(normalizeFolderName(name));
      if (editingId === null) setName("");
    } catch (submitError) {
      setError(toServiceError(submitError).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      noValidate
      className="grid gap-1.5"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          value={name}
          maxLength={NOTE_LIMITS.folderNameChars}
          placeholder="Nome da pasta"
          aria-label="Nome da pasta"
          aria-invalid={error !== null || undefined}
          autoFocus={editingId !== null}
          className="h-8"
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <Button type="submit" size="sm" disabled={saving}>
          {editingId === null ? <Plus aria-hidden="true" /> : <Check aria-hidden="true" />}
          {editingId === null ? "Criar" : "Salvar"}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="icon-sm" aria-label="Cancelar edição" onClick={onCancel}>
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

interface DeleteFolderDialogProps {
  folder: NoteFolder | null;
  noteCount: number;
  onConfirm: (folder: NoteFolder) => Promise<void>;
  onCancel: () => void;
}

/** Confirmação explícita: nomeia a pasta, diz quantas notas ficam sem pasta e que é auditado. */
function DeleteFolderDialog({ folder, noteCount, onConfirm, onCancel }: DeleteFolderDialogProps) {
  const [pending, setPending] = useState(false);

  return (
    <AlertDialog
      open={folder !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      {folder && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pasta?</AlertDialogTitle>
            <AlertDialogDescription>
              A pasta <strong className="text-foreground">“{folder.name}”</strong> será excluída
              permanentemente.{" "}
              {noteCount === 0
                ? "Ela não tem notas."
                : `${noteCount} ${noteCount === 1 ? "nota ficará" : "notas ficarão"} em “Sem pasta” (as notas não são excluídas).`}{" "}
              Esta ação não pode ser desfeita e será registrada no log de auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                setPending(true);
                void onConfirm(folder).finally(() => {
                  setPending(false);
                });
              }}
            >
              <Trash2 aria-hidden="true" />
              {pending ? "Excluindo…" : "Excluir pasta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
