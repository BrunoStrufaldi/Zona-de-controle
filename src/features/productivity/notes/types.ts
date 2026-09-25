import { type IsoDate, type IsoDateTime } from "@/types/common";

/** Contrato de Notas. Espelha `src-tauri/src/domain/notes.rs` — mantenha em sincronia. */

export interface Note {
  id: number;
  /** Pode ser vazio (exibido como "Sem título" ou pela data do diário). */
  title: string;
  /** Markdown. */
  content: string;
  folderId: number | null;
  favorite: boolean;
  /** Entradas de diário: data local (uma nota por dia). */
  journalDate: IsoDate | null;
  tags: string[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Criação/edição (substituição completa). `journalDate` só vale na criação. */
export interface NoteInput {
  title: string;
  content: string;
  folderId: number | null;
  tags: string[];
  journalDate: IsoDate | null;
}

export interface NoteVersion {
  id: number;
  noteId: number;
  title: string;
  content: string;
  createdAt: IsoDateTime;
}

export interface NoteFolder {
  id: number;
  name: string;
  noteCount: number;
}

/** O que a lista de notas mostra. */
export type NotesView =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "journal" }
  | { kind: "unfiled" }
  | { kind: "folder"; folderId: number };
