import { vi } from "vitest";

import {
  type Note,
  type NoteFolder,
  type NoteInput,
  type NoteVersion,
} from "@/features/productivity/notes/types";
import { mockDesktopRuntime } from "@/test/tauri";

/** O Tauri rejeita com o AppError serializado (objeto puro). */
function notFound(message: string): never {
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  throw { kind: "not_found", message };
}

/**
 * Backend de notas em memória para testes de interface. Simplificação: toda
 * alteração de texto guarda a versão anterior (sem o intervalo mínimo do Rust).
 */
export function mockNotesBackend(
  initial: Partial<Note>[] = [],
  initialFolders: Partial<NoteFolder>[] = [],
) {
  let nextId = 1;
  let nextVersionId = 1;
  let clock = 0;
  const stamp = () => new Date(Date.UTC(2026, 8, 25, 12, 0, clock++)).toISOString();

  const build = (partial: Partial<Note>): Note => {
    const id = partial.id ?? nextId;
    nextId = Math.max(nextId, id + 1);
    const now = stamp();
    return {
      id,
      title: `Nota ${id}`,
      content: "",
      folderId: null,
      favorite: false,
      journalDate: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
      ...partial,
    };
  };

  let notes: Note[] = initial.map(build);
  let versions: NoteVersion[] = [];
  let folders: NoteFolder[] = initialFolders.map((partial, index) => ({
    id: index + 1,
    name: `Pasta ${index + 1}`,
    noteCount: 0,
    ...partial,
  }));

  const find = (id: number) =>
    notes.find((note) => note.id === id) ?? notFound("nota não encontrada");
  const replace = (id: number, patch: Partial<Note>) => {
    notes = notes.map((note) => (note.id === id ? { ...note, ...patch } : note));
    return find(id);
  };
  const fromInput = (input: NoteInput) => ({
    title: input.title.trim(),
    content: input.content,
    folderId: input.folderId,
    tags: [...new Set(input.tags.map((tag) => tag.toLowerCase()))].sort(),
  });
  const snapshot = (note: Note) => {
    versions = [
      {
        id: nextVersionId++,
        noteId: note.id,
        title: note.title,
        content: note.content,
        createdAt: stamp(),
      },
      ...versions,
    ];
  };

  const handlers = {
    list_notes: vi.fn(() => notes),
    create_note: vi.fn(({ input }: { input: NoteInput }) => {
      const note = build({ ...fromInput(input), id: nextId, journalDate: input.journalDate });
      notes = [note, ...notes];
      return note;
    }),
    update_note: vi.fn(({ id, input }: { id: number; input: NoteInput }) => {
      const current = find(id);
      const next = fromInput(input);
      if (current.content !== next.content || current.title !== next.title) snapshot(current);
      return replace(id, { ...next, updatedAt: stamp() });
    }),
    set_note_favorite: vi.fn(({ id, favorite }: { id: number; favorite: boolean }) =>
      replace(id, { favorite }),
    ),
    delete_note: vi.fn(({ id }: { id: number }) => {
      find(id);
      notes = notes.filter((note) => note.id !== id);
      return null;
    }),
    list_note_versions: vi.fn(({ noteId }: { noteId: number }) =>
      versions.filter((version) => version.noteId === noteId),
    ),
    restore_note_version: vi.fn(({ versionId }: { versionId: number }) => {
      const version =
        versions.find((current) => current.id === versionId) ?? notFound("versão não encontrada");
      snapshot(find(version.noteId));
      return replace(version.noteId, {
        title: version.title,
        content: version.content,
        updatedAt: stamp(),
      });
    }),
    list_note_folders: vi.fn(() => folders),
    create_note_folder: vi.fn(({ name }: { name: string }) => {
      const folder = {
        id: Math.max(0, ...folders.map((current) => current.id)) + 1,
        name,
        noteCount: 0,
      };
      folders = [...folders, folder];
      return folder;
    }),
    rename_note_folder: vi.fn(({ id, name }: { id: number; name: string }) => {
      folders = folders.map((folder) => (folder.id === id ? { ...folder, name } : folder));
      return folders.find((folder) => folder.id === id) ?? notFound("pasta não encontrada");
    }),
    delete_note_folder: vi.fn(({ id }: { id: number }) => {
      folders = folders.filter((folder) => folder.id !== id);
      notes = notes.map((note) => (note.folderId === id ? { ...note, folderId: null } : note));
      return null;
    }),
  };

  mockDesktopRuntime(handlers);
  return { handlers, current: () => notes };
}
