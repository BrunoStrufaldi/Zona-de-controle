import { CalendarRange, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { Button } from "@/components/ui/button";
import { DeletePlanBlockDialog } from "@/features/productivity/weekly-plan/components/delete-plan-block-dialog";
import {
  PlanBlockDialog,
  type PlanBlockFormMode,
} from "@/features/productivity/weekly-plan/components/plan-block-dialog";
import { WeeklyPlanGrid } from "@/features/productivity/weekly-plan/components/weekly-plan-grid";
import { draftOf, newDraft } from "@/features/productivity/weekly-plan/domain/plan";
import { useWeeklyPlan } from "@/features/productivity/weekly-plan/hooks/use-weekly-plan";
import { type PlanBlock, type PlanBlockInput } from "@/features/productivity/weekly-plan/types";
import { useNow } from "@/hooks/use-now";
import { toServiceError } from "@/services/tauri/errors";

/** Aba "Planejamento semanal" da tela Rotinas: o plano fixo da semana. */
export function WeeklyPlanSection() {
  const { resource, actions } = useWeeklyPlan();
  const now = useNow();
  const [formMode, setFormMode] = useState<PlanBlockFormMode | null>(null);
  const [deleting, setDeleting] = useState<PlanBlock | null>(null);

  const openCreate = (weekday: number | null = null, startMinutes: number | null = null) => {
    setFormMode({ kind: "create", draft: newDraft(weekday, startMinutes) });
  };

  // Erros (ex.: conflito de horário) sobem para o formulário, que os exibe sem fechar.
  const submit = async (input: PlanBlockInput) => {
    const editing = formMode?.kind === "edit" ? formMode.block : null;
    const saved = await actions.save(editing?.id ?? null, input);
    toast.success(editing ? "Bloco atualizado" : "Bloco criado", {
      description: `“${saved.title}”`,
    });
    setFormMode(null);
  };

  const confirmDelete = async (block: PlanBlock) => {
    try {
      await actions.remove(block.id);
      toast.success("Bloco excluído", { description: `“${block.title}”` });
    } catch (error) {
      toast.error("Não foi possível excluir o bloco", {
        description: toServiceError(error).message,
      });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="grid gap-4">
      <ResourceView resource={resource} loadingLabel="Carregando o planejamento…">
        {(blocks) =>
          blocks.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="Nenhum bloco no planejamento"
              description="Monte a sua semana fixa: trabalho, academia, faculdade… Cada bloco se repete nos dias escolhidos. Também dá para clicar num horário da grade."
              action={
                <Button
                  onClick={() => {
                    openCreate();
                  }}
                >
                  <Plus aria-hidden="true" />
                  Novo bloco
                </Button>
              }
              className="py-12"
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Clique num horário vazio para criar um bloco ou num bloco para editar. A linha
                  marca a hora atual.
                </p>
                <Button
                  onClick={() => {
                    openCreate();
                  }}
                >
                  <Plus aria-hidden="true" />
                  Novo bloco
                </Button>
              </div>
              <WeeklyPlanGrid
                blocks={blocks}
                now={now}
                onCreate={openCreate}
                onEdit={(block) => {
                  setFormMode({ kind: "edit", block, draft: draftOf(block) });
                }}
              />
            </>
          )
        }
      </ResourceView>

      <PlanBlockDialog
        mode={formMode}
        onSubmit={submit}
        onDelete={(block) => {
          setFormMode(null);
          setDeleting(block);
        }}
        onClose={() => {
          setFormMode(null);
        }}
      />
      <DeletePlanBlockDialog
        block={deleting}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleting(null);
        }}
      />
    </div>
  );
}
