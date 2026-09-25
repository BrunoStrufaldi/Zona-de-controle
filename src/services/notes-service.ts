import {
  type Note,
  type NoteFolder,
  type NoteInput,
  type NoteVersion,
} from "@/features/productivity/notes/types";
import { invokeCommand } from "@/services/tauri/commands";

/** Todas as notas, inclusive as do diário. */
export function listNotes(): Promise<Note[]> {
  return invokeCommand("list_notes");
}

export function createNote(input: NoteInput): Promise<Note> {
  return invokeCommand("create_note", { input });
}

/** Salva a nota; o texto anterior pode entrar no histórico de versões. */
export function updateNote(id: number, input: NoteInput): Promise<Note> {
  return invokeCommand("update_note", { id, input });
}

export function setNoteFavorite(id: number, favorite: boolean): Promise<Note> {
  return invokeCommand("set_note_favorite", { id, favorite });
}

/** Exclusão definitiva e auditada. Só chame após confirmação explícita. */
export async function deleteNote(id: number): Promise<void> {
  await invokeCommand("delete_note", { id });
}

export function listNoteVersions(noteId: number): Promise<NoteVersion[]> {
  return invokeCommand("list_note_versions", { noteId });
}

/** Volta a nota para a versão; o texto atual entra no histórico antes. */
export function restoreNoteVersion(versionId: number): Promise<Note> {
  return invokeCommand("restore_note_version", { versionId });
}

export function listNoteFolders(): Promise<NoteFolder[]> {
  return invokeCommand("list_note_folders");
}

export function createNoteFolder(name: string): Promise<NoteFolder> {
  return invokeCommand("create_note_folder", { name });
}

export function renameNoteFolder(id: number, name: string): Promise<NoteFolder> {
  return invokeCommand("rename_note_folder", { id, name });
}

/** Exclusão definitiva e auditada da pasta (as notas ficam sem pasta). */
export async function deleteNoteFolder(id: number): Promise<void> {
  await invokeCommand("delete_note_folder", { id });
}
