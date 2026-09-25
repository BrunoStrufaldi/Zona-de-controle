import { Save } from "lucide-react";
import { type SyntheticEvent, useState } from "react";
import { toast } from "sonner";

import { ResourceView } from "@/components/shared/resource-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAsyncResource } from "@/hooks/use-async-resource";
import {
  DISPLAY_NAME_MAX_LENGTH,
  getDisplayName,
  setDisplayName,
} from "@/services/settings-service";
import { toServiceError } from "@/services/tauri/errors";

export function ProfileSection() {
  const displayName = useAsyncResource(getDisplayName);

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Salvo no banco local. Usado na saudação do dashboard.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ResourceView resource={displayName} className="py-6">
          {(current) => <DisplayNameForm initialValue={current ?? ""} />}
        </ResourceView>
      </CardContent>
    </Card>
  );
}

function DisplayNameForm({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const [saved, setSaved] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  const unchanged = value.trim() === saved.trim();

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const normalized = await setDisplayName(value);
      setValue(normalized);
      setSaved(normalized);
      toast.success("Nome salvo", { description: "A alteração foi registrada na auditoria." });
    } catch (error) {
      toast.error("Não foi possível salvar", { description: toServiceError(error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <div className="grid flex-1 gap-1.5">
        <Label htmlFor="display-name">Nome de exibição</Label>
        <Input
          id="display-name"
          value={value}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          placeholder="Como você quer ser chamado?"
          autoComplete="off"
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
      </div>
      <Button type="submit" disabled={saving || unchanged}>
        <Save aria-hidden="true" />
        {saving ? "Salvando…" : "Salvar"}
      </Button>
    </form>
  );
}
