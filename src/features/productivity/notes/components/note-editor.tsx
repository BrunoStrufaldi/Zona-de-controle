import { ArrowLeft, Columns2, Eye, History, PenLine, RotateCw, Star, Trash2 } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";

import { TagInput } from "@/components/shared/tag-input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarkdownPreview } from "@/features/productivity/notes/components/markdown-preview";
import { countWords, NOTE_LIMITS } from "@/features/productivity/notes/domain/notes";
import { type AutosaveStatus, useAutosave } from "@/features/productivity/notes/hooks/use-autosave";
import { type Note, type NoteFolder, type NoteInput } from "@/features/productivity/notes/types";
import { cn } from "@/lib/cn";
import { formatDateTime, formatLongDate } from "@/lib/format";
import { mergeTags, TAG_LIMITS } from "@/lib/tags";
import { type NotesEditorMode } from "@/stores/ui-store";
import { type IsoDate } from "@/types/common";

const NO_FOLDER = "none";

interface NoteEditorProps {
  /** Nota existente, ou `null` para um dia do diário ainda sem nota. */
  note: Note | null;
  /** Dia do diário (quando `note` é `null`, a nota é criada ao digitar). */
  journalDate: IsoDate | null;
  folders: readonly NoteFolder[];
  tagSuggestions: readonly string[];
  mode: NotesEditorMode;
  onModeChange: (mode: NotesEditorMode) => void;
  /** Cria (id nulo) ou salva a nota. */
  onPersist: (id: number | null, input: NoteInput) => Promise<Note>;
  onToggleFavorite: (note: Note) => void;
  onOpenHistory: (note: Note) => void;
  onDelete: (note: Note) => void;
  /** Voltar para a lista (telas estreitas). */
  onBack: () => void;
}

function toInput(note: Note | null, journalDate: IsoDate | null): NoteInput {
  return {
    title: note?.title ?? "",
    content: note?.content ?? "",
    folderId: note?.folderId ?? null,
    tags: note ? [...note.tags] : [],
    journalDate: note?.journalDate ?? journalDate,
  };
}

const modes: { value: NotesEditorMode; label: string; icon: typeof PenLine }[] = [
  { value: "edit", label: "Editar", icon: PenLine },
  { value: "split", label: "Dividir", icon: Columns2 },
  { value: "preview", label: "Visualizar", icon: Eye },
];

/**
 * Editor com salvamento automático. O rascunho é a fonte da verdade enquanto a
 * nota está aberta; montado de novo (via `key`) ao trocar de nota ou restaurar
 * uma versão.
 */
export function NoteEditor({
  note,
  journalDate,
  folders,
  tagSuggestions,
  mode,
  onModeChange,
  onPersist,
  onToggleFavorite,
  onOpenHistory,
  onDelete,
  onBack,
}: NoteEditorProps) {
  const [draft, setDraft] = useState<NoteInput>(() => toInput(note, journalDate));
  const noteId = useRef<number | null>(note?.id ?? null);
  const ids = { title: useId(), content: useId(), folder: useId(), tags: useId() };

  const persist = useCallback(
    async (input: NoteInput) => {
      const saved = await onPersist(noteId.current, input);
      noteId.current = saved.id;
    },
    [onPersist],
  );
  const autosave = useAutosave({ persist });

  const update = (patch: Partial<NoteInput>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    autosave.schedule(next);
  };

  const isJournal = draft.journalDate !== null;
  const heading = isJournal && draft.journalDate ? formatLongDate(draft.journalDate) : null;

  return (
    <section
      aria-label="Editor de nota"
      className="@container flex min-h-[32rem] min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="@3xl/notes:hidden"
          aria-label="Voltar para a lista"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <div
          role="group"
          aria-label="Modo do editor"
          className="flex rounded-md border border-border p-0.5"
        >
          {modes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => {
                onModeChange(value);
              }}
              className={cn(
                "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded px-2 text-xs transition-colors [&_svg]:size-3.5",
                mode === value
                  ? "bg-raised text-foreground"
                  : "text-muted-foreground hover:text-foreground",
                value === "split" && "hidden @xl:inline-flex",
              )}
            >
              <Icon aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <SaveStatus status={autosave.status} onRetry={() => void autosave.retry()} />
        <div className="ml-auto flex items-center gap-1">
          {note && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-pressed={note.favorite}
                aria-label={note.favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                onClick={() => {
                  onToggleFavorite(note);
                }}
              >
                <Star
                  aria-hidden="true"
                  className={cn(note.favorite && "fill-warning text-warning")}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Histórico de versões"
                onClick={() => {
                  void autosave.flush().then(() => {
                    onOpenHistory(note);
                  });
                }}
              >
                <History aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-danger hover:text-danger"
                aria-label="Excluir nota"
                onClick={() => {
                  onDelete(note);
                }}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </div>

      {heading && <p className="text-xs tracking-wide text-primary uppercase">{heading}</p>}
      <input
        id={ids.title}
        value={draft.title}
        maxLength={NOTE_LIMITS.titleChars}
        placeholder={isJournal ? "Título (opcional)" : "Sem título"}
        aria-label="Título da nota"
        className="w-full bg-transparent text-xl font-semibold outline-none placeholder:text-subtle-foreground"
        onChange={(event) => {
          update({ title: event.target.value });
        }}
      />

      <div className="flex flex-wrap items-start gap-3">
        {!isJournal && (
          <Select
            value={draft.folderId === null ? NO_FOLDER : String(draft.folderId)}
            onValueChange={(value) => {
              update({ folderId: value === NO_FOLDER ? null : Number(value) });
            }}
          >
            <SelectTrigger id={ids.folder} aria-label="Pasta" className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_FOLDER}>Sem pasta</SelectItem>
              {folders.map((folder) => (
                <SelectItem key={folder.id} value={String(folder.id)}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="min-w-56 flex-1">
          <TagInput
            id={ids.tags}
            value={draft.tags}
            onChange={(tags) => {
              update({ tags });
            }}
            merge={mergeTags}
            suggestions={tagSuggestions}
            maxTags={TAG_LIMITS.tags}
            placeholder="Adicionar tag…"
          />
        </div>
      </div>

      <div className={cn("grid min-h-0 flex-1 gap-4", mode === "split" && "@xl:grid-cols-2")}>
        {mode !== "preview" && (
          <textarea
            id={ids.content}
            value={draft.content}
            maxLength={NOTE_LIMITS.contentChars}
            aria-label="Conteúdo da nota (Markdown)"
            placeholder={
              isJournal
                ? "Como foi o dia? Escreva em Markdown…"
                : "Escreva em Markdown: # título, **negrito**, - listas, - [ ] tarefas…"
            }
            autoFocus={note === null || note.content === ""}
            spellCheck
            className="min-h-96 w-full flex-1 resize-none rounded-md border border-input bg-background/60 p-3 font-mono text-sm leading-relaxed outline-none focus:border-primary/70"
            onChange={(event) => {
              update({ content: event.target.value });
            }}
          />
        )}
        {mode !== "edit" && (
          <div
            className={cn(
              "min-h-96 overflow-y-auto rounded-md border border-border p-4",
              mode === "split" && "hidden @xl:block",
            )}
            aria-label="Pré-visualização"
          >
            <MarkdownPreview content={draft.content} />
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-subtle-foreground">
        <span>
          <span className="font-mono tabular">{countWords(draft.content)}</span> palavras
        </span>
        {note && <span>Editada em {formatDateTime(note.updatedAt)}</span>}
        {autosave.error && <span className="text-danger">{autosave.error.message}</span>}
      </footer>
    </section>
  );
}

const statusLabels: Record<AutosaveStatus, string> = {
  idle: "",
  pending: "Alterações não salvas",
  saving: "Salvando…",
  saved: "Salvo",
  error: "Erro ao salvar",
};

function SaveStatus({ status, onRetry }: { status: AutosaveStatus; onRetry: () => void }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-1 text-xs",
        status === "error" ? "text-danger" : "text-subtle-foreground",
      )}
    >
      {statusLabels[status]}
      {status === "error" && (
        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={onRetry}>
          <RotateCw aria-hidden="true" />
          Tentar de novo
        </Button>
      )}
    </span>
  );
}
