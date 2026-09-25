import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { newTaskHref, paths } from "@/app/router/paths";
import { toIsoDate } from "@/lib/dates";
import { mockTasksBackend } from "@/test/fake-tasks-backend";
import { useUiStore } from "@/stores/ui-store";
import { renderRoute } from "@/test/render";

describe("página de Tarefas — lista", () => {
  it("lista as tarefas em aberto do backend", async () => {
    mockTasksBackend([
      { id: 1, title: "Pagar internet", priority: "urgent", tags: ["casa"] },
      { id: 2, title: "Já feita", status: "done" },
    ]);
    renderRoute(paths.productivity.tasks);

    const list = await screen.findByRole("list", { name: "Lista de tarefas" });
    expect(within(list).getByText("Pagar internet")).toBeInTheDocument();
    expect(within(list).getByText("#casa")).toBeInTheDocument();
    expect(within(list).getByLabelText("Prioridade Urgente")).toBeInTheDocument();
    // Concluídas ficam ocultas no filtro padrão ("Em aberto").
    expect(within(list).queryByText("Já feita")).not.toBeInTheDocument();
  });

  it("mostra estado vazio e cria a primeira tarefa pelo formulário", async () => {
    const user = userEvent.setup();
    const backend = mockTasksBackend();
    renderRoute(paths.productivity.tasks);

    await screen.findByText("Nenhuma tarefa ainda");
    await user.click(screen.getAllByRole("button", { name: /Nova tarefa/ })[0] as HTMLElement);

    const dialog = await screen.findByRole("dialog", { name: "Nova tarefa" });
    // Título obrigatório: nada é enviado sem ele.
    await user.click(within(dialog).getByRole("button", { name: /Criar tarefa/ }));
    expect(await within(dialog).findByText("Informe um título.")).toBeInTheDocument();
    expect(backend.handlers.create_task).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Título *"), "  Estudar Rust  ");
    await user.type(within(dialog).getByLabelText("Tags"), "Estudos{Enter}");
    await user.click(within(dialog).getByRole("button", { name: /Criar tarefa/ }));

    await waitFor(() => {
      expect(backend.handlers.create_task).toHaveBeenCalledWith({
        input: expect.objectContaining({ title: "Estudar Rust", tags: ["estudos"] }) as unknown,
      });
    });
    expect(await screen.findByText("Estudar Rust")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("abre o formulário de criação pelo link do menu Criar", async () => {
    mockTasksBackend([{ id: 1, title: "Existente" }]);
    renderRoute(newTaskHref);

    expect(await screen.findByRole("dialog", { name: "Nova tarefa" })).toBeInTheDocument();
  });

  it("conclui uma tarefa pelo checkbox", async () => {
    const user = userEvent.setup();
    const backend = mockTasksBackend([{ id: 7, title: "Ligar para o banco" }]);
    renderRoute(paths.productivity.tasks);

    await user.click(
      await screen.findByRole("checkbox", { name: "Concluir “Ligar para o banco”" }),
    );

    expect(backend.handlers.move_task).toHaveBeenCalledWith({
      id: 7,
      status: "done",
      beforeId: null,
    });
    await waitFor(() => {
      expect(screen.queryByText("Ligar para o banco")).not.toBeInTheDocument();
    });
  });

  it("só exclui após confirmação explícita", async () => {
    const user = userEvent.setup();
    const backend = mockTasksBackend([{ id: 3, title: "Rascunho antigo" }]);
    renderRoute(paths.productivity.tasks);

    await user.click(
      await screen.findByRole("button", { name: "Ações da tarefa “Rascunho antigo”" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /Excluir/ }));

    const confirm = await screen.findByRole("alertdialog", { name: "Excluir tarefa?" });
    expect(within(confirm).getByText(/registrada no log de auditoria/)).toBeInTheDocument();

    // Cancelar não exclui.
    await user.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    expect(backend.handlers.delete_task).not.toHaveBeenCalled();
    expect(screen.getByText("Rascunho antigo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ações da tarefa “Rascunho antigo”" }));
    await user.click(await screen.findByRole("menuitem", { name: /Excluir/ }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: /Excluir tarefa/,
      }),
    );

    await waitFor(() => {
      expect(backend.handlers.delete_task).toHaveBeenCalledWith({ id: 3 });
    });
    await waitFor(() => {
      expect(screen.queryByText("Rascunho antigo")).not.toBeInTheDocument();
    });
  });

  it("filtra pela busca", async () => {
    const user = userEvent.setup();
    mockTasksBackend([
      { id: 1, title: "Revisar orçamento" },
      { id: 2, title: "Lavar o carro" },
    ]);
    renderRoute(paths.productivity.tasks);

    await user.type(await screen.findByLabelText("Buscar tarefas"), "orcamento");

    expect(screen.getByText("Revisar orçamento")).toBeInTheDocument();
    expect(screen.queryByText("Lavar o carro")).not.toBeInTheDocument();
  });
});

describe("página de Tarefas — Kanban", () => {
  async function openKanban() {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: /Kanban/ }));
    return user;
  }

  it("distribui as tarefas nas colunas por status", async () => {
    mockTasksBackend([
      { id: 1, title: "Planejar viagem" },
      { id: 2, title: "Escrever artigo", status: "in_progress" },
      { id: 3, title: "Pagar boleto", status: "done" },
    ]);
    renderRoute(paths.productivity.tasks);
    await openKanban();

    const doing = screen.getByRole("region", { name: "Coluna Fazendo" });
    expect(within(doing).getByText("Escrever artigo")).toBeInTheDocument();
    // No Kanban as concluídas aparecem na coluna "Feito".
    const done = screen.getByRole("region", { name: "Coluna Feito" });
    expect(within(done).getByText("Pagar boleto")).toBeInTheDocument();
    expect(within(done).getByText("1")).toBeInTheDocument();
  });

  it("move uma tarefa de coluna pelo menu de ações", async () => {
    const backend = mockTasksBackend([{ id: 5, title: "Revisar contrato" }]);
    renderRoute(paths.productivity.tasks);
    const user = await openKanban();

    await user.click(screen.getByRole("button", { name: "Ações da tarefa “Revisar contrato”" }));
    await user.click(await screen.findByRole("menuitem", { name: "Fazendo" }));

    expect(backend.handlers.move_task).toHaveBeenCalledWith({
      id: 5,
      status: "in_progress",
      beforeId: null,
    });
    const doing = screen.getByRole("region", { name: "Coluna Fazendo" });
    expect(await within(doing).findByText("Revisar contrato")).toBeInTheDocument();
  });

  it("cria tarefa já na coluna escolhida", async () => {
    const backend = mockTasksBackend([{ id: 1, title: "Existente" }]);
    renderRoute(paths.productivity.tasks);
    const user = await openKanban();

    await user.click(screen.getByRole("button", { name: "Nova tarefa em “Fazendo”" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova tarefa" });
    await user.type(within(dialog).getByLabelText("Título *"), "Em andamento");
    await user.click(within(dialog).getByRole("button", { name: /Criar tarefa/ }));

    await waitFor(() => {
      expect(backend.handlers.create_task).toHaveBeenCalledWith({
        input: expect.objectContaining({ status: "in_progress" }) as unknown,
      });
    });
  });
});

describe("página de Tarefas — recorrência, checklist, categorias e arquivo", () => {
  // A visão escolhida (Lista/Kanban/Arquivadas) fica no store entre os testes.
  beforeEach(() => {
    useUiStore.setState({ tasksView: "list" });
  });

  it("cria tarefa recorrente com checklist; a recorrência sugere vencimento", async () => {
    const user = userEvent.setup();
    const backend = mockTasksBackend([{ id: 1, title: "Existente" }], [{ id: 3, name: "Casa" }]);
    renderRoute(paths.productivity.tasks);

    await screen.findByText("Existente");
    await user.click(screen.getAllByRole("button", { name: /Nova tarefa/ })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog", { name: "Nova tarefa" });
    await user.type(within(dialog).getByLabelText("Título *"), "Levar o lixo");

    await user.click(within(dialog).getByRole("combobox", { name: "Categoria" }));
    await user.click(await screen.findByRole("option", { name: "Casa" }));
    await user.click(within(dialog).getByRole("combobox", { name: "Repetir" }));
    await user.click(await screen.findByRole("option", { name: "Semanalmente" }));
    await user.click(within(dialog).getByRole("button", { name: "segunda-feira" }));
    // Sem vencimento, a recorrência usa hoje.
    expect(within(dialog).getByLabelText("Vencimento")).toHaveValue(toIsoDate(new Date()));
    expect(within(dialog).getByText(/a próxima ocorrência vencerá em/)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Checklist"), "Separar recicláveis{Enter}");
    await user.click(within(dialog).getByRole("button", { name: /Criar tarefa/ }));

    await waitFor(() => {
      expect(backend.handlers.create_task).toHaveBeenCalledWith({
        input: expect.objectContaining({
          categoryId: 3,
          recurrence: { frequency: "weekly", interval: 1, weekdays: [1] },
          checklist: [{ text: "Separar recicláveis", done: false }],
        }) as unknown,
      });
    });
    expect(await screen.findByLabelText("Categoria Casa")).toBeInTheDocument();
    expect(screen.getByLabelText("Repete: Toda semana: seg")).toBeInTheDocument();
  });

  it("concluir uma recorrente cria e avisa a próxima ocorrência", async () => {
    const user = userEvent.setup();
    const today = toIsoDate(new Date());
    mockTasksBackend([
      {
        id: 1,
        title: "Regar plantas",
        dueDate: today,
        recurrence: { frequency: "daily", interval: 1, weekdays: [] },
      },
    ]);
    renderRoute(paths.productivity.tasks);

    await user.click(await screen.findByRole("checkbox", { name: "Concluir “Regar plantas”" }));

    expect(await screen.findByText("Próxima ocorrência criada")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Lista de tarefas" });
    expect(await within(list).findByText("Regar plantas")).toBeInTheDocument();
    expect(within(list).getByLabelText(/Vencimento: Amanhã/)).toBeInTheDocument();
  });

  it("marca itens da checklist direto na lista", async () => {
    const user = userEvent.setup();
    const backend = mockTasksBackend([
      {
        id: 1,
        title: "Pintar a sala",
        checklist: [
          { id: 10, text: "Comprar tinta", done: true },
          { id: 11, text: "Cobrir móveis", done: false },
        ],
      },
    ]);
    renderRoute(paths.productivity.tasks);

    await user.click(await screen.findByRole("button", { name: "Checklist: 1 de 2 concluídos" }));
    await user.click(screen.getByRole("checkbox", { name: "Cobrir móveis" }));

    expect(backend.handlers.set_checklist_item_done).toHaveBeenCalledWith({
      itemId: 11,
      done: true,
    });
    expect(
      await screen.findByRole("button", { name: "Checklist: 2 de 2 concluídos" }),
    ).toBeInTheDocument();
  });

  it("arquiva pelo menu e restaura na aba Arquivadas", async () => {
    const user = userEvent.setup();
    const backend = mockTasksBackend([{ id: 4, title: "Declarar imposto" }]);
    renderRoute(paths.productivity.tasks);

    await user.click(
      await screen.findByRole("button", { name: "Ações da tarefa “Declarar imposto”" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Arquivar" }));

    expect(backend.handlers.archive_task).toHaveBeenCalledWith({ id: 4 });
    await waitFor(() => {
      expect(screen.queryByRole("list", { name: "Lista de tarefas" })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: /Arquivadas/ }));
    const archived = await screen.findByRole("list", { name: "Tarefas arquivadas" });
    expect(within(archived).getByText("Declarar imposto")).toBeInTheDocument();

    await user.click(
      within(archived).getByRole("button", { name: "Restaurar “Declarar imposto”" }),
    );
    expect(backend.handlers.restore_task).toHaveBeenCalledWith({ id: 4 });
    expect(await screen.findByText("Nenhuma tarefa arquivada")).toBeInTheDocument();
  });

  it("arquiva todas as concluídas de uma vez", async () => {
    const user = userEvent.setup();
    const backend = mockTasksBackend([
      { id: 1, title: "Aberta" },
      { id: 2, title: "Feita 1", status: "done" },
      { id: 3, title: "Feita 2", status: "done" },
    ]);
    renderRoute(paths.productivity.tasks);

    await user.click(await screen.findByRole("button", { name: "Arquivar concluídas (2)" }));

    expect(backend.handlers.archive_completed_tasks).toHaveBeenCalled();
    expect(await screen.findByText("2 tarefas arquivadas")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Arquivadas 2/ })).toBeInTheDocument();
  });

  it("cria categoria e só exclui após confirmação", async () => {
    const user = userEvent.setup();
    const backend = mockTasksBackend(
      [{ id: 1, title: "Relatório", categoryId: 1 }],
      [{ id: 1, name: "Trabalho", color: "blue" }],
    );
    renderRoute(paths.productivity.tasks);

    await user.click(await screen.findByRole("button", { name: /Categorias/ }));
    const dialog = await screen.findByRole("dialog", { name: "Categorias" });
    const list = within(dialog).getByRole("list", { name: "Categorias" });
    expect(within(list).getByText("1 tarefa")).toBeInTheDocument();

    const create = within(dialog).getByRole("region", { name: "Nova categoria" });
    await user.type(within(create).getByLabelText("Nome da categoria"), "trabalho");
    await user.click(within(create).getByRole("button", { name: /Adicionar/ }));
    expect(await within(create).findByText(/Já existe uma categoria/)).toBeInTheDocument();

    await user.clear(within(create).getByLabelText("Nome da categoria"));
    await user.type(within(create).getByLabelText("Nome da categoria"), "Saúde");
    await user.click(within(create).getByRole("radio", { name: "Verde" }));
    await user.click(within(create).getByRole("button", { name: /Adicionar/ }));
    await waitFor(() => {
      expect(backend.handlers.create_task_category).toHaveBeenCalledWith({
        input: { name: "Saúde", color: "green" },
      });
    });
    expect(await within(list).findByText("Saúde")).toBeInTheDocument();

    await user.click(within(list).getByRole("button", { name: "Excluir categoria “Trabalho”" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Excluir categoria?" });
    expect(within(confirm).getByText(/1 tarefa ficará sem categoria/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    expect(backend.handlers.delete_task_category).not.toHaveBeenCalled();

    await user.click(within(list).getByRole("button", { name: "Excluir categoria “Trabalho”" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: /Excluir categoria/,
      }),
    );
    await waitFor(() => {
      expect(backend.handlers.delete_task_category).toHaveBeenCalledWith({ id: 1 });
    });
    await waitFor(() => {
      expect(within(list).queryByText("Trabalho")).not.toBeInTheDocument();
    });
  });
});
