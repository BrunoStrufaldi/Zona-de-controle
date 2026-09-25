import { FileText, Folders, NotebookPen, Plus, Search, SearchX } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JournalNavigator } from "@/features/productivity/notes/components/journal-navigator";
import { NoteEditor } from "@/features/productivity/notes/components/note-editor";
import { NoteList } from "@/features/productivity/notes/components/note-list";
import {
  collectNoteTags,
  describeView,
  filterNotes,
  findJournalEntry,
} from "@/features/productivity/notes/domain/notes";
import { type NotesData } from "@/features/productivity/notes/hooks/use-notes";
import { type Note, type NoteInput, type NotesView } from "@/features/productivity/notes/types";
import { cn } from "@/lib/cn";
import { type NotesEditorMode } from "@/stores/ui-store";
import { type IsoDate } from "@/types/common";

export type NoteSelection = { kind: "note"; id: number } | { kind: "journal"; date: IsoDate };

const ALL_TAGS = "__all__";

function viewToValue(view: NotesView): string {
  return view.kind === "folder" ? `folder:${view.folderId}` : view.kind;
}

function valueToView(value: string): NotesView {
  if (value.startsWith("folder:")) return { kind: "folder", folderId: Number(value.slice(7)) };
  return { kind: value as Exclude<NotesView["kind"], "folder"> };
}

interface NotesWorkspaceProps {
  data: NotesData;
  view: NotesView;
  onViewChange: (view: NotesView) => void;
  search: string;
  onSearchChange: (search: string) => void;
  tag: string | null;
  onTagChange: (tag: string | null) => void;
  selection: NoteSelection | null;
  onSelectionChange: (selection: NoteSelection | null) => void;
  today: IsoDate;
  /** Muda para remontar o editor (ex.: após restaurar uma versão). */
  editorRevision: number;
  editorMode: NotesEditorMode;
  onEditorModeChange: (mode: NotesEditorMode) => void;
  onCreate: () => void;
  onManageFolders: () => void;
  onPersist: (id: number | null, input: NoteInput) => Promise<Note>;
  onToggleFavorite: (note: Note) => void;
  onOpenHistory: (note: Note) => void;
  onDelete: (note: Note) => void;
}

export function NotesWorkspace({
  data,
  view,
  onViewChange,
  search,
  onSearchChange,
  tag,
  onTagChange,
  selection,
  onSelectionChange,
  today,
  editorRevision,
  editorMode,
  onEditorModeChange,
  onCreate,
  onManageFolders,
  onPersist,
  onToggleFavorite,
  onOpenHistory,
  onDelete,
}: NotesWorkspaceProps) {
  const tags = collectNoteTags(data.notes);
  const visible = filterNotes(data.notes, { view, search, tag });
  const journalDate = selection?.kind === "journal" ? selection.date : today;
  const selectedNote =
    selection?.kind === "note"
      ? data.notes.find((note) => note.id === selection.id)
      : selection?.kind === "journal"
        ? findJournalEntry(data.notes, selection.date)
        : undefined;
  const editorOpen =
    selection !== null && (selection.kind === "journal" || selectedNote !== undefined);
  const listLabel = describeView(view, data.folders);

  return (
    <div className="@container/notes">
      <div className="grid gap-4 @3xl/notes:grid-cols-[19rem_minmax(0,1fr)]">
        <div
          className={cn("grid min-w-0 content-start gap-3", editorOpen && "hidden @3xl/notes:grid")}
        >
          <div className="flex items-center gap-2">
            <Select
              value={viewToValue(view)}
              onValueChange={(value) => {
                onViewChange(valueToView(value));
              }}
            >
              <SelectTrigger aria-label="Mostrar" className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as notas</SelectItem>
                <SelectItem value="favorites">Favoritas</SelectItem>
                <SelectItem value="journal">Diário</SelectItem>
                <SelectItem value="unfiled">Sem pasta</SelectItem>
                {data.folders.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Pastas</SelectLabel>
                      {data.folders.map((folder) => (
                        <SelectItem key={folder.id} value={`folder:${folder.id}`}>
                          {folder.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Gerenciar pastas"
              title="Gerenciar pastas"
              onClick={onManageFolders}
            >
              <Folders aria-hidden="true" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => {
                  onSearchChange(event.target.value);
                }}
                placeholder="Buscar nas notas…"
                aria-label="Buscar notas"
                className="pl-9"
              />
            </div>
            {tags.length > 0 && (
              <Select
                value={tag ?? ALL_TAGS}
                onValueChange={(value) => {
                  onTagChange(value === ALL_TAGS ? null : value);
                }}
              >
                <SelectTrigger aria-label="Filtrar por tag" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TAGS}>Tags</SelectItem>
                  {tags.map((current) => (
                    <SelectItem key={current} value={current}>
                      #{current}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {view.kind === "journal" && (
            <JournalNavigator
              date={journalDate}
              today={today}
              onChange={(date) => {
                onSelectionChange({ kind: "journal", date });
              }}
            />
          )}

          {visible.length > 0 ? (
            <NoteList
              notes={visible}
              folders={data.folders}
              selectedId={selectedNote?.id ?? null}
              label={listLabel}
              onSelect={(note) => {
                onSelectionChange(
                  view.kind === "journal" && note.journalDate !== null
                    ? { kind: "journal", date: note.journalDate }
                    : { kind: "note", id: note.id },
                );
              }}
            />
          ) : data.notes.length === 0 && view.kind !== "journal" ? (
            <EmptyState
              icon={NotebookPen}
              title="Nenhuma nota ainda"
              description="Anote ideias, reuniões e referências — tudo fica neste computador."
              action={
                <Button size="sm" onClick={onCreate}>
                  <Plus aria-hidden="true" />
                  Nova nota
                </Button>
              }
            />
          ) : view.kind === "journal" && search === "" && tag === null ? (
            <p className="px-1 text-sm text-muted-foreground">
              Nenhuma entrada ainda. Escolha um dia e comece a escrever.
            </p>
          ) : (
            <EmptyState
              icon={SearchX}
              title="Nenhuma nota encontrada"
              description="Ajuste a busca, a tag ou a visão."
            />
          )}
        </div>

        <div className={cn("min-w-0", !editorOpen && "hidden @3xl/notes:block")}>
          {editorOpen ? (
            <NoteEditor
              key={
                selection.kind === "journal"
                  ? `journal:${selection.date}:${editorRevision}`
                  : `note:${selection.id}:${editorRevision}`
              }
              note={selectedNote ?? null}
              journalDate={selection.kind === "journal" ? selection.date : null}
              folders={data.folders}
              tagSuggestions={tags}
              mode={editorMode}
              onModeChange={onEditorModeChange}
              onPersist={onPersist}
              onToggleFavorite={onToggleFavorite}
              onOpenHistory={onOpenHistory}
              onDelete={onDelete}
              onBack={() => {
                onSelectionChange(null);
              }}
            />
          ) : (
            <EmptyState
              icon={FileText}
              title="Nenhuma nota aberta"
              description="Escolha uma nota na lista ou crie uma nova."
              className="min-h-[32rem]"
            />
          )}
        </div>
      </div>
    </div>
  );
}
