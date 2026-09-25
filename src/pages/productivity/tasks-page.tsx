import { ListChecks, Plus, Tags } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import { NEW_TASK_PARAM } from "@/app/router/paths";
import { PageHeader } from "@/components/shared/page-header";
import { ResourceView } from "@/components/shared/resource-view";
import { Button } from "@/components/ui/button";
import { CategoriesDialog } from "@/features/productivity/tasks/components/categories-dialog";
import { DeleteTaskDialog } from "@/features/productivity/tasks/components/delete-task-dialog";
import {
  TaskFormDialog,
  type TaskFormMode,
} from "@/features/productivity/tasks/components/task-form-dialog";
import { TasksView } from "@/features/productivity/tasks/components/tasks-view";
import { DEFAULT_TASK_FILTERS } from "@/features/productivity/tasks/domain/filters";
import { statusLabels } from "@/features/productivity/tasks/domain/labels";
import { useTasks } from "@/features/productivity/tasks/hooks/use-tasks";
import {
  type Task,
  type TaskCategory,
  type TaskCategoryInput,
  type TaskChange,
  type TaskInput,
} from "@/features/productivity/tasks/types";
import { toIsoDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { toServiceError } from "@/services/tauri/errors";
import { useUiStore } from "@/stores/ui-store";

function notifyError(title: string, error: unknown) {
  toast.error(title, { description: toServiceError(error).message });
}

/** Avisa quando concluir uma tarefa recorrente criou a próxima ocorrência. */
function notifyNextOccurrence(change: TaskChange) {
  const next = change.nextOccurrence;
  if (next?.dueDate) {
    toast.success("Próxima ocorrência criada", {
      description: `“${next.title}” vence em ${formatDate(next.dueDate)}.`,
    });
  }
}

export function TasksPage() {
  const { resource, actions } = useTasks();
  const view = useUiStore((state) => state.tasksView);
  const setView = useUiStore((state) => state.setTasksView);
  const [filters, setFilters] = useState(DEFAULT_TASK_FILTERS);
  const [formMode, setFormMode] = useState<TaskFormMode | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const today = toIsoDate(new Date());
  const createRequested = searchParams.get(NEW_TASK_PARAM) === "1";
  const activeForm: TaskFormMode | null = formMode ?? (createRequested ? { kind: "create" } : null);
  const loaded = resource.status === "success" ? resource.data : null;

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
    let change: TaskChange;
    if (activeForm?.kind === "edit") {
      change = await actions.update(activeForm.task.id, input);
      toast.success("Tarefa atualizada");
    } else {
      change = await actions.create(input);
      toast.success("Tarefa criada");
    }
    notifyNextOccurrence(change);
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

  // Erros sobem para o formulário da categoria, que os exibe.
  const saveCategory = async (id: number | null, input: TaskCategoryInput) => {
    const saved = await actions.saveCategory(id, input);
    toast.success(id === null ? "Categoria criada" : "Categoria atualizada", {
      description: `“${saved.name}”`,
    });
  };

  const deleteCategory = async (category: TaskCategory) => {
    try {
      await actions.removeCategory(category.id);
      toast.success("Categoria excluída", { description: `“${category.name}”` });
    } catch (error) {
      notifyError("Não foi possível excluir a categoria", error);
    }
  };

  return (
    <>
      <PageHeader
        title="Tarefas"
        description="Organize o que precisa ser feito, em lista ou no quadro Kanban."
        icon={ListChecks}
        actions={
          loaded && (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setCategoriesOpen(true);
                }}
              >
                <Tags aria-hidden="true" />
                Categorias
              </Button>
              <Button
                onClick={() => {
                  setFormMode({ kind: "create" });
                }}
              >
                <Plus aria-hidden="true" />
                Nova tarefa
              </Button>
            </>
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
              actions
                .toggleDone(task)
                .then(notifyNextOccurrence)
                .catch((error: unknown) => {
                  notifyError("Não foi possível atualizar a tarefa", error);
                });
            }}
            onMove={(task, status) => {
              actions
                .move(task.id, { status, beforeId: null })
                .then((change) => {
                  toast.success(`Movida para “${statusLabels[status]}”`);
                  notifyNextOccurrence(change);
                })
                .catch((error: unknown) => {
                  notifyError("Não foi possível mover a tarefa", error);
                });
            }}
            onReorder={(task, target) => {
              actions
                .move(task.id, target)
                .then(notifyNextOccurrence)
                .catch((error: unknown) => {
                  notifyError("Não foi possível mover a tarefa", error);
                });
            }}
            onToggleChecklistItem={(itemId, done) => {
              actions.toggleChecklistItem(itemId, done).catch((error: unknown) => {
                notifyError("Não foi possível atualizar a checklist", error);
              });
            }}
            onArchive={(task) => {
              actions
                .archive(task.id)
                .then(() => {
                  toast.success("Tarefa arquivada", {
                    description: `“${task.title}” pode ser restaurada em “Arquivadas”.`,
                  });
                })
                .catch((error: unknown) => {
                  notifyError("Não foi possível arquivar a tarefa", error);
                });
            }}
            onArchiveCompleted={() => {
              actions
                .archiveCompleted()
                .then((count) => {
                  toast.success(count === 1 ? "1 tarefa arquivada" : `${count} tarefas arquivadas`);
                })
                .catch((error: unknown) => {
                  notifyError("Não foi possível arquivar as concluídas", error);
                });
            }}
            onRestore={(task) => {
              actions
                .restore(task.id)
                .then(() => {
                  toast.success("Tarefa restaurada", { description: `“${task.title}”` });
                })
                .catch((error: unknown) => {
                  notifyError("Não foi possível restaurar a tarefa", error);
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
        tagSuggestions={loaded?.tags ?? []}
        categories={loaded?.categories ?? []}
        today={today}
        onSubmit={submitForm}
        onClose={closeForm}
      />
      <CategoriesDialog
        open={categoriesOpen}
        categories={loaded?.categories ?? []}
        onSave={saveCategory}
        onDelete={deleteCategory}
        onClose={() => {
          setCategoriesOpen(false);
        }}
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
