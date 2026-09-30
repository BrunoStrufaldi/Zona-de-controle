import { CalendarRange, Plus, Repeat } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import { ROUTINES_TAB_PARAM } from "@/app/router/paths";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ResourceView } from "@/components/shared/resource-view";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeleteRoutineDialog } from "@/features/productivity/routines/components/delete-routine-dialog";
import { RoutineCard } from "@/features/productivity/routines/components/routine-card";
import {
  RoutineFormDialog,
  type RoutineFormMode,
} from "@/features/productivity/routines/components/routine-form-dialog";
import { useRoutines } from "@/features/productivity/routines/hooks/use-routines";
import { type Routine, type RoutineInput } from "@/features/productivity/routines/types";
import { WeeklyPlanSection } from "@/features/productivity/weekly-plan/components/weekly-plan-section";
import { toServiceError } from "@/services/tauri/errors";

function notifyError(title: string, error: unknown) {
  toast.error(title, { description: toServiceError(error).message });
}

export function RoutinesPage() {
  const { resource, actions } = useRoutines();
  const [formMode, setFormMode] = useState<RoutineFormMode | null>(null);
  const [deleting, setDeleting] = useState<Routine | null>(null);
  const routines = resource.status === "success" ? resource.data : [];
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get(ROUTINES_TAB_PARAM) === "plan" ? "plan" : "routines";

  // Erros sobem para o formulário, que os exibe sem fechar.
  const submitForm = async (input: RoutineInput) => {
    const editing = formMode?.kind === "edit" ? formMode.routine : null;
    const saved = await actions.save(editing?.id ?? null, input);
    toast.success(editing ? "Rotina atualizada" : "Rotina criada", {
      description: `“${saved.name}”`,
    });
    setFormMode(null);
  };

  const confirmDelete = async (routine: Routine) => {
    try {
      await actions.remove(routine.id);
      toast.success("Rotina excluída", { description: `“${routine.name}”` });
    } catch (error) {
      notifyError("Não foi possível excluir a rotina", error);
    } finally {
      setDeleting(null);
    }
  };

  const openCreate = () => {
    setFormMode({ kind: "create" });
  };

  return (
    <>
      <PageHeader
        title="Rotinas"
        description="Hábitos agrupados em rotinas, com sequência de dias e consistência, e o planejamento fixo da semana."
        icon={Repeat}
        actions={
          tab === "routines" &&
          resource.status === "success" && (
            <Button onClick={openCreate}>
              <Plus aria-hidden="true" />
              Nova rotina
            </Button>
          )
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setSearchParams(value === "plan" ? { [ROUTINES_TAB_PARAM]: "plan" } : {}, {
            replace: true,
          });
        }}
        className="gap-6"
      >
        <TabsList aria-label="Visão">
          <TabsTrigger value="routines">
            <Repeat aria-hidden="true" />
            Rotinas
          </TabsTrigger>
          <TabsTrigger value="plan">
            <CalendarRange aria-hidden="true" />
            Planejamento semanal
          </TabsTrigger>
        </TabsList>
        <TabsContent value="plan">
          <WeeklyPlanSection />
        </TabsContent>
        <TabsContent value="routines">
          <ResourceView resource={resource} loadingLabel="Carregando rotinas…">
            {(data) =>
              data.length === 0 ? (
                <EmptyState
                  icon={Repeat}
                  title="Nenhuma rotina ainda"
                  description="Crie uma rotina (ex.: manhã, academia, estudos) e marque os hábitos a cada dia."
                  action={
                    <Button onClick={openCreate}>
                      <Plus aria-hidden="true" />
                      Nova rotina
                    </Button>
                  }
                  className="py-16"
                />
              ) : (
                <div className="grid gap-4">
                  {data.map((routine) => (
                    <RoutineCard
                      key={routine.id}
                      routine={routine}
                      onToggleHabit={(habitId, date, done) => {
                        actions.toggleHabit(habitId, date, done).catch((error: unknown) => {
                          notifyError("Não foi possível marcar o hábito", error);
                        });
                      }}
                      onEdit={(current) => {
                        setFormMode({ kind: "edit", routine: current });
                      }}
                      onDelete={setDeleting}
                    />
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Você pode marcar hábitos de hoje até 7 dias atrás. A sequência conta os dias da
                    agenda com todos os hábitos feitos; hoje ainda em andamento não quebra a
                    sequência.
                  </p>
                </div>
              )
            }
          </ResourceView>
        </TabsContent>
      </Tabs>

      <RoutineFormDialog
        mode={formMode}
        routines={routines}
        onSubmit={submitForm}
        onClose={() => {
          setFormMode(null);
        }}
      />
      <DeleteRoutineDialog
        routine={deleting}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleting(null);
        }}
      />
    </>
  );
}
