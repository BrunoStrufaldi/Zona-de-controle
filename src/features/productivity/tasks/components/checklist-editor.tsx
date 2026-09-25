import { Plus, X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { checklistProgress } from "@/features/productivity/tasks/domain/checklist";
import { TASK_LIMITS } from "@/features/productivity/tasks/domain/validation";
import { type ChecklistItemInput } from "@/features/productivity/tasks/types";
import { cn } from "@/lib/cn";

interface ChecklistEditorProps {
  id: string;
  value: readonly ChecklistItemInput[];
  onChange: (items: ChecklistItemInput[]) => void;
  invalid?: boolean;
}

/** Itens da checklist no formulário: marcar, editar, remover e adicionar (Enter). */
export function ChecklistEditor({ id, value, onChange, invalid = false }: ChecklistEditorProps) {
  const [draft, setDraft] = useState("");
  const reachedLimit = value.length >= TASK_LIMITS.checklistItems;
  const { done, total } = checklistProgress(value);

  const replace = (index: number, patch: Partial<ChecklistItemInput>) => {
    onChange(value.map((item, current) => (current === index ? { ...item, ...patch } : item)));
  };

  const add = () => {
    const text = draft.trim();
    if (text === "" || reachedLimit) return;
    onChange([...value, { text, done: false }]);
    setDraft("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter adiciona o item em vez de enviar o formulário.
    if (event.key === "Enter") {
      event.preventDefault();
      add();
    }
  };

  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <ul className="grid gap-1.5" aria-label={`Itens da checklist (${done} de ${total})`}>
          {value.map((item, index) => (
            <li key={index} className="flex items-center gap-2">
              <Checkbox
                checked={item.done}
                aria-label={`Concluir item “${item.text}”`}
                onCheckedChange={(checked) => {
                  replace(index, { done: checked === true });
                }}
              />
              <Input
                value={item.text}
                maxLength={TASK_LIMITS.checklistItemChars}
                aria-label={`Item ${index + 1} da checklist`}
                className={cn("h-8", item.done && "text-muted-foreground line-through")}
                onChange={(event) => {
                  replace(index, { text: event.target.value });
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remover item “${item.text}”`}
                onClick={() => {
                  onChange(value.filter((_, current) => current !== index));
                }}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={draft}
          maxLength={TASK_LIMITS.checklistItemChars}
          disabled={reachedLimit}
          placeholder={reachedLimit ? "Limite de itens atingido" : "Adicionar item…"}
          aria-invalid={invalid || undefined}
          className="h-8"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={handleKeyDown}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={draft.trim() === "" || reachedLimit}
          onClick={add}
        >
          <Plus aria-hidden="true" />
          Adicionar
        </Button>
      </div>
    </div>
  );
}
