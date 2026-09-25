import { useCallback, useEffect, useMemo, useState } from "react";

import { type Note, type NoteFolder, type NoteInput } from "@/features/productivity/notes/types";
import { type AsyncResource, type AsyncResourceState } from "@/hooks/use-async-resource";
import {
  createNote,
  createNoteFolder,
  deleteNote,
  deleteNoteFolder,
  listNoteFolders,
  listNotes,
  renameNoteFolder,
  restoreNoteVersion,
  setNoteFavorite,
  updateNote,
} from "@/services/notes-service";
import { toServiceError } from "@/services/tauri/errors";

export interface NotesData {
  notes: Note[];
  folders: NoteFolder[];
}

export interface NotesActions {
  create: (input: NoteInput) => Promise<Note>;
  /** Salvamento do editor: atualiza só a nota na lista, sem recarregar tudo. */
  save: (id: number, input: NoteInput) => Promise<Note>;
  toggleFavorite: (note: Note) => Promise<void>;
  restoreVersion: (versionId: number) => Promise<Note>;
  /** Exclusão definitiva — chame apenas após confirmação do usuário. */
  remove: (id: number) => Promise<void>;
  createFolder: (name: string) => Promise<NoteFolder>;
  renameFolder: (id: number, name: string) => Promise<NoteFolder>;
  /** Exclusão definitiva da pasta — chame apenas após confirmação do usuário. */
  removeFolder: (id: number) => Promise<void>;
}

type Updater = (data: NotesData) => NotesData;

const upsertNote =
  (note: Note): Updater =>
  (data) => ({
    ...data,
    notes: data.notes.some((current) => current.id === note.id)
      ? data.notes.map((current) => (current.id === note.id ? note : current))
      : [note, ...data.notes],
  });

/**
 * Notas e pastas da página. Salvamentos do editor atualizam a nota localmente
 * com a resposta do backend (sem recarregar a lista, para não atrapalhar quem
 * está digitando). Exclusões e pastas recarregam tudo do banco ao terminar.
 * Erros são relançados como `ServiceError`.
 */
export function useNotes(): { resource: AsyncResource<NotesData>; actions: NotesActions } {
  const [state, setState] = useState<AsyncResourceState<NotesData>>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([listNotes(), listNoteFolders()]).then(
      ([notes, folders]) => {
        if (active) setState({ status: "success", data: { notes, folders } });
      },
      (error: unknown) => {
        if (active) setState({ status: "error", error: toServiceError(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    refresh();
  }, [refresh]);

  const apply = useCallback((update: Updater) => {
    setState((current) =>
      current.status === "success" ? { ...current, data: update(current.data) } : current,
    );
  }, []);

  /** Executa a ação; `after` aplica o resultado localmente ou `reloadAfter` recarrega tudo. */
  const run = useCallback(
    async <T>(
      action: () => Promise<T>,
      {
        optimistic,
        after,
        reloadAfter = false,
      }: {
        optimistic?: Updater;
        after?: (result: T) => Updater;
        reloadAfter?: boolean;
      } = {},
    ): Promise<T> => {
      if (optimistic) apply(optimistic);
      try {
        const result = await action();
        if (after) apply(after(result));
        return result;
      } catch (error) {
        if (optimistic) refresh();
        throw toServiceError(error);
      } finally {
        if (reloadAfter) refresh();
      }
    },
    [apply, refresh],
  );

  const actions = useMemo<NotesActions>(
    () => ({
      create: (input) => run(() => createNote(input), { after: upsertNote }),
      save: (id, input) => run(() => updateNote(id, input), { after: upsertNote }),
      toggleFavorite: async (note) => {
        await run(() => setNoteFavorite(note.id, !note.favorite), {
          optimistic: upsertNote({ ...note, favorite: !note.favorite }),
          after: upsertNote,
        });
      },
      restoreVersion: (versionId) =>
        run(() => restoreNoteVersion(versionId), { after: upsertNote }),
      remove: (id) =>
        run(() => deleteNote(id), {
          optimistic: (data) => ({ ...data, notes: data.notes.filter((note) => note.id !== id) }),
          reloadAfter: true,
        }),
      createFolder: (name) => run(() => createNoteFolder(name), { reloadAfter: true }),
      renameFolder: (id, name) => run(() => renameNoteFolder(id, name), { reloadAfter: true }),
      removeFolder: (id) =>
        run(() => deleteNoteFolder(id), {
          optimistic: (data) => ({
            folders: data.folders.filter((folder) => folder.id !== id),
            notes: data.notes.map((note) =>
              note.folderId === id ? { ...note, folderId: null } : note,
            ),
          }),
          reloadAfter: true,
        }),
    }),
    [run],
  );

  const resource = useMemo(() => ({ ...state, reload }), [state, reload]);
  return { resource, actions };
}
