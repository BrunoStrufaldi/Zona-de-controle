import { BookOpen, NotebookPen, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { ResourceView } from "@/components/shared/resource-view";
import { Button } from "@/components/ui/button";
import { DeleteNoteDialog } from "@/features/productivity/notes/components/delete-note-dialog";
import { FoldersDialog } from "@/features/productivity/notes/components/folders-dialog";
import {
  type NoteSelection,
  NotesWorkspace,
} from "@/features/productivity/notes/components/notes-workspace";
import { VersionsDialog } from "@/features/productivity/notes/components/versions-dialog";
import { noteDisplayTitle } from "@/features/productivity/notes/domain/notes";
import { useNotes } from "@/features/productivity/notes/hooks/use-notes";
import {
  type Note,
  type NoteFolder,
  type NoteInput,
  type NotesView,
} from "@/features/productivity/notes/types";
import { toIsoDate } from "@/lib/dates";
import { toServiceError } from "@/services/tauri/errors";
import { useUiStore } from "@/stores/ui-store";

function notifyError(title: string, error: unknown) {
  toast.error(title, { description: toServiceError(error).message });
}

export function NotesPage() {
  const { resource, actions } = useNotes();
  const editorMode = useUiStore((state) => state.notesEditorMode);
  const setEditorMode = useUiStore((state) => state.setNotesEditorMode);
  const [view, setView] = useState<NotesView>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [selection, setSelection] = useState<NoteSelection | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [deleting, setDeleting] = useState<Note | null>(null);
  const [historyNote, setHistoryNote] = useState<Note | null>(null);

  const today = toIsoDate(new Date());
  const loaded = resource.status === "success" ? resource.data : null;
  const noteCounts = new Map<number, number>();
  for (const note of loaded?.notes ?? []) {
    if (note.folderId !== null) {
      noteCounts.set(note.folderId, (noteCounts.get(note.folderId) ?? 0) + 1);
    }
  }

  const changeView = (next: NotesView) => {
    setView(next);
    setSelection(next.kind === "journal" ? { kind: "journal", date: today } : null);
  };

  const openTodayJournal = () => {
    setView({ kind: "journal" });
    setSelection({ kind: "journal", date: today });
  };

  const createNote = async () => {
    try {
      const note = await actions.create({
        title: "",
        content: "",
        folderId: view.kind === "folder" ? view.folderId : null,
        tags: [],
        journalDate: null,
      });
      if (view.kind !== "all" && view.kind !== "folder" && view.kind !== "unfiled") {
        setView({ kind: "all" });
      }
      setSelection({ kind: "note", id: note.id });
    } catch (error) {
      notifyError("Não foi possível criar a nota", error);
    }
  };

  // Erros sobem para o salvamento automático, que mostra "Erro ao salvar".
  const persist = (id: number | null, input: NoteInput) =>
    id === null ? actions.create(input) : actions.save(id, input);

  const confirmDelete = async (note: Note) => {
    try {
      await actions.remove(note.id);
      toast.success("Nota excluída", { description: `“${noteDisplayTitle(note)}”` });
      setSelection(null);
    } catch (error) {
      notifyError("Não foi possível excluir a nota", error);
    } finally {
      setDeleting(null);
    }
  };

  const saveFolder = async (id: number | null, name: string) => {
    const folder =
      id === null ? await actions.createFolder(name) : await actions.renameFolder(id, name);
    toast.success(id === null ? "Pasta criada" : "Pasta renomeada", {
      description: `“${folder.name}”`,
    });
  };

  const deleteFolder = async (folder: NoteFolder) => {
    try {
      await actions.removeFolder(folder.id);
      toast.success("Pasta excluída", { description: `“${folder.name}”` });
      if (view.kind === "folder" && view.folderId === folder.id) changeView({ kind: "all" });
    } catch (error) {
      notifyError("Não foi possível excluir a pasta", error);
    }
  };

  return (
    <>
      <PageHeader
        title="Notas"
        description="Notas em Markdown, diário e referências — salvas automaticamente."
        icon={NotebookPen}
        actions={
          loaded && (
            <>
              <Button variant="secondary" onClick={openTodayJournal}>
                <BookOpen aria-hidden="true" />
                Diário de hoje
              </Button>
              <Button onClick={() => void createNote()}>
                <Plus aria-hidden="true" />
                Nova nota
              </Button>
            </>
          )
        }
      />

      <ResourceView resource={resource} loadingLabel="Carregando notas…">
        {(data) => (
          <NotesWorkspace
            data={data}
            view={view}
            onViewChange={changeView}
            search={search}
            onSearchChange={setSearch}
            tag={tag}
            onTagChange={setTag}
            selection={selection}
            onSelectionChange={setSelection}
            today={today}
            editorRevision={editorRevision}
            editorMode={editorMode}
            onEditorModeChange={setEditorMode}
            onCreate={() => void createNote()}
            onManageFolders={() => {
              setFoldersOpen(true);
            }}
            onPersist={persist}
            onToggleFavorite={(note) => {
              actions.toggleFavorite(note).catch((error: unknown) => {
                notifyError("Não foi possível atualizar a nota", error);
              });
            }}
            onOpenHistory={setHistoryNote}
            onDelete={setDeleting}
          />
        )}
      </ResourceView>

      <VersionsDialog
        note={historyNote}
        onRestore={async (version) => {
          try {
            await actions.restoreVersion(version.id);
            setEditorRevision((revision) => revision + 1);
            setHistoryNote(null);
            toast.success("Versão restaurada", {
              description: "O texto anterior foi guardado no histórico.",
            });
          } catch (error) {
            notifyError("Não foi possível restaurar a versão", error);
          }
        }}
        onClose={() => {
          setHistoryNote(null);
        }}
      />
      <FoldersDialog
        open={foldersOpen}
        folders={loaded?.folders ?? []}
        noteCounts={noteCounts}
        onSave={saveFolder}
        onDelete={deleteFolder}
        onClose={() => {
          setFoldersOpen(false);
        }}
      />
      <DeleteNoteDialog
        note={deleting}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleting(null);
        }}
      />
    </>
  );
}
