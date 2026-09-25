import { ListChecks, Plus } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import { NEW_TASK_PARAM } from "@/app/router/paths";
import { PageHeader } from "@/components/shared/page-header";
import { ResourceView } from "@/components/shared/resource-view";
import { Button } from "@/components/ui/button";
import { DeleteTaskDialog } from "@/features/productivity/tasks/components/delete-task-dialog";
import {
  TaskFormDialog,
  type TaskFormMode,
} from "@/features/productivity/tasks/components/task-form-dialog";
import { TasksView } from "@/features/productivity/tasks/components/tasks-view";
import { DEFAULT_TASK_FILTERS } from "@/features/productivity/tasks/domain/filters";
import { statusLabels } from "@/features/productivity/tasks/domain/labels";
import { useTasks } from "@/features/productivity/tasks/hooks/use-tasks";
import { type Task, type TaskInput } from "@/features/productivity/tasks/types";
import { toIsoDate } from "@/lib/dates";
import { toServiceError } from "@/services/tauri/errors";
import { useUiStore } from "@/stores/ui-store";

function notifyError(title: string, error: unknown) {
  toast.error(title, { description: toServiceError(error).message });
}

export function TasksPage() {
  const { resource, actions } = useTasks();
  const view = useUiStore((state) => state.tasksView);
  const setView = useUiStore((state) => state.setTasksView);
  const [filters, setFilters] = useState(DEFAULT_TASK_FILTERS);
  const [formMode, setFormMode] = useState<TaskFormMode | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const today = toIsoDate(new Date());
  const createRequested = searchParams.get(NEW_TASK_PARAM) === "1";
  const activeForm: TaskFormMode | null = formMode ?? (createRequested ? { kind: "create" } : null);
  const tagSuggestions = resource.status === "success" ? resource.data.tags : [];

  const closeForm = () => {
    setFormMode(null);
    if (createRequested) {
      setSearchParams(
        (params) => {
          params.delete(NEW_TASK_PARAM);
          return params;
        },
        { replace: true },
      );
    }
  };

  // Erros sobem para o formulário, que os exibe sem fechar.
  const submitForm = async (input: TaskInput) => {
    if (activeForm?.kind === "edit") {
      await actions.update(activeForm.task.id, input);
      toast.success("Tarefa atualizada");
    } else {
      await actions.create(input);
      toast.success("Tarefa criada");
    }
    closeForm();
  };

  const confirmDelete = async (task: Task) => {
    try {
      await actions.remove(task.id);
      toast.success("Tarefa excluída", { description: `“${task.title}”` });
    } catch (error) {
      notifyError("Não foi possível excluir a tarefa", error);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Tarefas"
        description="Organize o que precisa ser feito, em lista ou no quadro Kanban."
        icon={ListChecks}
        actions={
          resource.status === "success" && (
            <Button
              onClick={() => {
                setFormMode({ kind: "create" });
              }}
            >
              <Plus aria-hidden="true" />
              Nova tarefa
            </Button>
          )
        }
      />

      <ResourceView resource={resource} loadingLabel="Carregando tarefas…">
        {(data) => (
          <TasksView
            data={data}
            view={view}
            onViewChange={setView}
            filters={filters}
            onFiltersChange={setFilters}
            today={today}
            onCreate={(status) => {
              setFormMode({ kind: "create", status });
            }}
            onToggleDone={(task) => {
              actions.toggleDone(task).catch((error: unknown) => {
                notifyError("Não foi possível atualizar a tarefa", error);
              });
            }}
            onMove={(task, status) => {
              actions
                .move(task.id, { status, beforeId: null })
                .then(() => {
                  toast.success(`Movida para “${statusLabels[status]}”`);
                })
                .catch((error: unknown) => {
                  notifyError("Não foi possível mover a tarefa", error);
                });
            }}
            onReorder={(task, target) => {
              actions.move(task.id, target).catch((error: unknown) => {
                notifyError("Não foi possível mover a tarefa", error);
              });
            }}
            onEdit={(task) => {
              setFormMode({ kind: "edit", task });
            }}
            onDelete={setDeleting}
          />
        )}
      </ResourceView>

      <TaskFormDialog
        mode={activeForm}
        tagSuggestions={tagSuggestions}
        onSubmit={submitForm}
        onClose={closeForm}
      />
      <DeleteTaskDialog
        task={deleting}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleting(null);
        }}
      />
    </>
  );
}
