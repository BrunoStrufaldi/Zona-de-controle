import { BookOpen, Folder, Star } from "lucide-react";

import { noteDisplayTitle, noteExcerpt } from "@/features/productivity/notes/domain/notes";
import { type Note, type NoteFolder } from "@/features/productivity/notes/types";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

interface NoteListProps {
  notes: readonly Note[];
  folders: readonly NoteFolder[];
  selectedId: number | null;
  onSelect: (note: Note) => void;
  label: string;
}

export function NoteList({ notes, folders, selectedId, onSelect, label }: NoteListProps) {
  const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]));

  return (
    <ul className="grid gap-1.5" aria-label={label}>
      {notes.map((note) => {
        const excerpt = noteExcerpt(note.content);
        const folderName = note.folderId === null ? undefined : folderNames.get(note.folderId);
        const selected = note.id === selectedId;
        return (
          <li key={note.id}>
            <button
              type="button"
              aria-current={selected || undefined}
              onClick={() => {
                onSelect(note);
              }}
              className={cn(
                "grid w-full cursor-pointer gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
                selected
                  ? "border-primary/50 bg-primary/5"
                  : "border-border bg-card hover:border-border-strong",
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {note.journalDate !== null && (
                  <BookOpen className="size-3.5 shrink-0 text-primary" aria-label="Diário" />
                )}
                <span
                  className={cn(
                    "truncate text-sm font-medium",
                    note.title.trim() === "" &&
                      note.journalDate === null &&
                      "text-muted-foreground",
                  )}
                >
                  {noteDisplayTitle(note)}
                </span>
                {note.favorite && (
                  <Star
                    className="ml-auto size-3.5 shrink-0 fill-warning text-warning"
                    aria-label="Favorita"
                  />
                )}
              </span>
              {excerpt !== "" && (
                <span className="line-clamp-2 text-xs text-muted-foreground">{excerpt}</span>
              )}
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-subtle-foreground">
                <span className="font-mono tabular">{formatDate(note.updatedAt)}</span>
                {folderName && (
                  <span className="inline-flex items-center gap-1">
                    <Folder className="size-3" aria-hidden="true" />
                    {folderName}
                  </span>
                )}
                {note.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
