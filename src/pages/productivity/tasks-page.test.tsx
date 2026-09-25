import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { newTaskHref, paths } from "@/app/router/paths";
import { mockTasksBackend } from "@/test/fake-tasks-backend";
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
