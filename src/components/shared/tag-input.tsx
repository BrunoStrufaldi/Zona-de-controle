import { Plus, X } from "lucide-react";
import { type KeyboardEvent, useId, useState } from "react";

import { cn } from "@/lib/cn";

interface TagInputProps {
  id?: string;
  value: readonly string[];
  onChange: (tags: string[]) => void;
  /** Normaliza e deduplica (ex.: `mergeTags` do módulo). */
  merge: (current: readonly string[], incoming: readonly string[]) => string[];
  suggestions?: readonly string[];
  maxTags?: number;
  placeholder?: string;
  invalid?: boolean;
}

const MAX_VISIBLE_SUGGESTIONS = 8;

/** Campo de tags: Enter ou vírgula adiciona; Backspace no campo vazio remove a última. */
export function TagInput({
  id,
  value,
  onChange,
  merge,
  suggestions = [],
  maxTags,
  placeholder = "Adicionar tag…",
  invalid = false,
}: TagInputProps) {
  const [draft, setDraft] = useState("");
  const hintId = useId();
  const reachedLimit = maxTags !== undefined && value.length >= maxTags;

  const commit = (raw: string) => {
    const parts = raw.split(",");
    const next = merge(value, parts);
    onChange(maxTags === undefined ? next : next.slice(0, maxTags));
    setDraft("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      if (draft.trim() !== "") commit(draft);
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const available = suggestions
    .filter((tag) => !value.includes(tag) && tag.includes(draft.trim().toLowerCase()))
    .slice(0, MAX_VISIBLE_SUGGESTIONS);

  return (
    <div className="grid gap-2">
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background/60 px-2 py-1.5",
          "transition-[border-color,box-shadow] duration-150 focus-within:border-primary/70 focus-within:shadow-glow-sm",
          invalid && "border-danger",
        )}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-raised py-0.5 pr-1 pl-2 text-xs"
          >
            #{tag}
            <button
              type="button"
              onClick={() => {
                onChange(value.filter((item) => item !== tag));
              }}
              className="cursor-pointer rounded-full p-0.5 text-muted-foreground hover:bg-hover hover:text-foreground"
              aria-label={`Remover tag ${tag}`}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          disabled={reachedLimit}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (draft.trim() !== "") commit(draft);
          }}
          placeholder={reachedLimit ? "Limite de tags atingido" : placeholder}
          aria-describedby={hintId}
          aria-invalid={invalid || undefined}
          className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-subtle-foreground disabled:cursor-not-allowed"
        />
      </div>
      <p id={hintId} className="sr-only">
        Pressione Enter ou vírgula para adicionar. Backspace remove a última tag.
      </p>
      {available.length > 0 && !reachedLimit && (
        <div className="flex flex-wrap gap-1.5" aria-label="Tags existentes">
          {available.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => {
                commit(tag);
              }}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
            >
              <Plus className="size-3" aria-hidden="true" />
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
