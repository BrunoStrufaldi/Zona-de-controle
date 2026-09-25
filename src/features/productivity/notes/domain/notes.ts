import { type Note, type NoteFolder, type NotesView } from "@/features/productivity/notes/types";
import { formatDate } from "@/lib/format";
import { matchesSearch } from "@/lib/text";

/** Limites espelhados de `src-tauri/src/domain/notes.rs`. */
export const NOTE_LIMITS = {
  titleChars: 200,
  contentChars: 200_000,
  folderNameChars: 60,
  folders: 100,
  versions: 20,
} as const;

/** Título para exibição: o próprio, a data do diário ou "Sem título". */
export function noteDisplayTitle(note: Pick<Note, "title" | "journalDate">): string {
  const title = note.title.trim();
  if (title !== "") return title;
  if (note.journalDate !== null) return `Diário de ${formatDate(note.journalDate)}`;
  return "Sem título";
}

/**
 * Trecho em texto simples para a lista: remove a marcação Markdown mais comum
 * (títulos, ênfase, links, código, listas) e junta as linhas.
 */
export function noteExcerpt(content: string, maxChars = 160): string {
  const text = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/gm, "")
    .replace(/[*_~`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxChars ? `${text.slice(0, maxChars - 1).trimEnd()}…` : text;
}

export function countWords(content: string): number {
  const words = content.trim().match(/\S+/g);
  return words ? words.length : 0;
}

export interface NotesFilter {
  view: NotesView;
  search: string;
  /** Tag selecionada, ou `null` para todas. */
  tag: string | null;
}

function matchesView(note: Note, view: NotesView): boolean {
  switch (view.kind) {
    case "all":
      return true;
    case "favorites":
      return note.favorite;
    case "journal":
      return note.journalDate !== null;
    case "unfiled":
      return note.folderId === null && note.journalDate === null;
    case "folder":
      return note.folderId === view.folderId;
  }
}

/**
 * Filtra pela visão, tag e busca (título, conteúdo e tags, sem acentos).
 * Ordem: favoritas primeiro (fora do diário), depois as editadas mais recentemente.
 */
export function filterNotes(notes: readonly Note[], filter: NotesFilter): Note[] {
  return notes
    .filter(
      (note) =>
        matchesView(note, filter.view) &&
        (filter.tag === null || note.tags.includes(filter.tag)) &&
        matchesSearch([note.title, note.content, ...note.tags], filter.search),
    )
    .sort((a, b) => {
      if (filter.view.kind === "journal") {
        return (b.journalDate ?? "").localeCompare(a.journalDate ?? "");
      }
      return Number(b.favorite) - Number(a.favorite) || b.updatedAt.localeCompare(a.updatedAt);
    });
}

/** Tags usadas nas notas, em ordem alfabética. */
export function collectNoteTags(notes: readonly Note[]): string[] {
  return [...new Set(notes.flatMap((note) => note.tags))].sort((a, b) => a.localeCompare(b));
}

export function findJournalEntry(notes: readonly Note[], date: string): Note | undefined {
  return notes.find((note) => note.journalDate === date);
}

/** Nome da visão (título da lista). */
export function describeView(view: NotesView, folders: readonly NoteFolder[]): string {
  switch (view.kind) {
    case "all":
      return "Todas as notas";
    case "favorites":
      return "Favoritas";
    case "journal":
      return "Diário";
    case "unfiled":
      return "Sem pasta";
    case "folder":
      return folders.find((folder) => folder.id === view.folderId)?.name ?? "Pasta";
  }
}

/** Nome de pasta normalizado como no backend. */
export function normalizeFolderName(name: string): string {
  return name.trim().split(/\s+/).join(" ");
}

/** Validação para feedback imediato. Retorna a mensagem de erro ou `null`. */
export function validateFolderName(
  name: string,
  existing: readonly NoteFolder[],
  editingId: number | null = null,
): string | null {
  const normalized = normalizeFolderName(name);
  if (normalized === "") return "Informe um nome.";
  if (normalized.length > NOTE_LIMITS.folderNameChars)
    return `Use no máximo ${NOTE_LIMITS.folderNameChars} caracteres.`;
  const clash = existing.some(
    (folder) => folder.id !== editingId && folder.name.toLowerCase() === normalized.toLowerCase(),
  );
  return clash ? `Já existe uma pasta chamada “${normalized}”.` : null;
}
