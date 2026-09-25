import { History, RotateCcw } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownPreview } from "@/features/productivity/notes/components/markdown-preview";
import {
  NOTE_LIMITS,
  noteDisplayTitle,
  noteExcerpt,
} from "@/features/productivity/notes/domain/notes";
import { useNoteVersions } from "@/features/productivity/notes/hooks/use-note-versions";
import { type Note, type NoteVersion } from "@/features/productivity/notes/types";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

interface VersionsDialogProps {
  /** Nota cujo histórico é exibido; `null` fecha o diálogo. */
  note: Note | null;
  onRestore: (version: NoteVersion) => Promise<void>;
  onClose: () => void;
}

export function VersionsDialog({ note, onRestore, onClose }: VersionsDialogProps) {
  return (
    <Dialog
      open={note !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {note && (
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de “{noteDisplayTitle(note)}”</DialogTitle>
            <DialogDescription>
              Uma versão é guardada quando você edita a nota (no máximo uma a cada 5 minutos). As{" "}
              {NOTE_LIMITS.versions} mais recentes ficam disponíveis. Restaurar também guarda o
              texto atual, então dá para voltar atrás.
            </DialogDescription>
          </DialogHeader>
          <VersionsBrowser key={note.id} note={note} onRestore={onRestore} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function VersionsBrowser({
  note,
  onRestore,
}: {
  note: Note;
  onRestore: (version: NoteVersion) => Promise<void>;
}) {
  const versions = useNoteVersions(note.id);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);

  return (
    <ResourceView resource={versions} className="py-8">
      {(data) => {
        if (data.length === 0) {
          return (
            <EmptyState
              icon={History}
              title="Nenhuma versão ainda"
              description="Continue editando: as versões anteriores aparecem aqui."
              className="py-8"
            />
          );
        }
        const selected = data.find((version) => version.id === selectedId) ?? data[0];
        return (
          <>
            <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
              <ul className="grid content-start gap-1.5" aria-label="Versões">
                {data.map((version) => (
                  <li key={version.id}>
                    <button
                      type="button"
                      aria-current={version.id === selected?.id || undefined}
                      onClick={() => {
                        setSelectedId(version.id);
                      }}
                      className={cn(
                        "grid w-full cursor-pointer gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
                        version.id === selected?.id
                          ? "border-primary/50 bg-primary/5"
                          : "border-border hover:border-border-strong",
                      )}
                    >
                      <span className="font-mono text-xs tabular">
                        {formatDateTime(version.createdAt)}
                      </span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {noteExcerpt(version.content, 90) || "(vazia)"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {selected && (
                <div
                  className="max-h-[55vh] min-h-48 overflow-y-auto rounded-md border border-border p-4"
                  aria-label="Conteúdo da versão"
                >
                  <p className="mb-3 text-base font-semibold">
                    {noteDisplayTitle({ ...selected, journalDate: note.journalDate })}
                  </p>
                  <MarkdownPreview content={selected.content} />
                </div>
              )}
            </div>
            {selected && (
              <DialogFooter>
                <Button
                  disabled={restoring}
                  onClick={() => {
                    setRestoring(true);
                    void onRestore(selected).finally(() => {
                      setRestoring(false);
                    });
                  }}
                >
                  <RotateCcw aria-hidden="true" />
                  {restoring ? "Restaurando…" : "Restaurar esta versão"}
                </Button>
              </DialogFooter>
            )}
          </>
        );
      }}
    </ResourceView>
  );
}
