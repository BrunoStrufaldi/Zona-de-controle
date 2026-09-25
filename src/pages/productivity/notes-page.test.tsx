import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { paths } from "@/app/router/paths";
import { toIsoDate } from "@/lib/dates";
import { useUiStore } from "@/stores/ui-store";
import { mockNotesBackend } from "@/test/fake-notes-backend";
import { renderRoute } from "@/test/render";

describe("página de Notas", () => {
  beforeEach(() => {
    useUiStore.setState({ notesEditorMode: "edit" });
  });

  it("cria uma nota e salva automaticamente ao digitar", async () => {
    const user = userEvent.setup();
    const backend = mockNotesBackend();
    renderRoute(paths.productivity.notes);

    await screen.findByText("Nenhuma nota ainda");
    await user.click(screen.getAllByRole("button", { name: /Nova nota/ })[0] as HTMLElement);
    await waitFor(() => {
      expect(backend.handlers.create_note).toHaveBeenCalledTimes(1);
    });

    const editor = await screen.findByRole("region", { name: "Editor de nota" });
    await user.type(within(editor).getByLabelText("Título da nota"), "Reunião");
    await user.type(
      within(editor).getByLabelText("Conteúdo da nota (Markdown)"),
      "Pauta: orçamento",
    );

    await waitFor(() => {
      expect(backend.handlers.update_note).toHaveBeenLastCalledWith({
        id: 1,
        input: expect.objectContaining({
          title: "Reunião",
          content: "Pauta: orçamento",
        }) as unknown,
      });
    });
    expect(await within(editor).findByText("Salvo")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Todas as notas" });
    expect(within(list).getByText("Reunião")).toBeInTheDocument();
  });

  it("busca sem acentos e mostra a pré-visualização do Markdown", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ notesEditorMode: "preview" });
    mockNotesBackend([
      { id: 1, title: "Orçamento", content: "# Custos\n\nVer [planilha](https://exemplo.com)" },
      { id: 2, title: "Receitas", content: "Bolo" },
    ]);
    renderRoute(paths.productivity.notes);

    await user.type(await screen.findByLabelText("Buscar notas"), "orcamento");
    const list = screen.getByRole("list", { name: "Todas as notas" });
    expect(within(list).queryByText("Receitas")).not.toBeInTheDocument();

    await user.click(within(list).getByText("Orçamento"));
    const preview = await screen.findByLabelText("Pré-visualização");
    expect(within(preview).getByRole("heading", { name: "Custos" })).toBeInTheDocument();
    // Links não navegam dentro da janela do app.
    expect(within(preview).queryByRole("link")).not.toBeInTheDocument();
    expect(within(preview).getByText("planilha")).toHaveAttribute("title", "https://exemplo.com");
  });

  it("escreve no diário de hoje, criando a nota do dia só ao digitar", async () => {
    const user = userEvent.setup();
    const backend = mockNotesBackend([{ id: 1, title: "Outra" }]);
    renderRoute(paths.productivity.notes);

    await user.click(await screen.findByRole("button", { name: /Diário de hoje/ }));
    const editor = await screen.findByRole("region", { name: "Editor de nota" });
    expect(backend.handlers.create_note).not.toHaveBeenCalled();

    await user.type(within(editor).getByLabelText("Conteúdo da nota (Markdown)"), "Dia produtivo");

    await waitFor(() => {
      expect(backend.handlers.create_note).toHaveBeenCalledWith({
        input: expect.objectContaining({
          journalDate: toIsoDate(new Date()),
          content: "Dia produtivo",
        }) as unknown,
      });
    });
    expect(backend.handlers.create_note).toHaveBeenCalledTimes(1);
  });

  it("favorita e só exclui após confirmação", async () => {
    const user = userEvent.setup();
    const backend = mockNotesBackend([{ id: 3, title: "Rascunho" }]);
    renderRoute(paths.productivity.notes);

    await user.click(await screen.findByText("Rascunho"));
    const editor = await screen.findByRole("region", { name: "Editor de nota" });
    await user.click(within(editor).getByRole("button", { name: "Adicionar aos favoritos" }));
    expect(backend.handlers.set_note_favorite).toHaveBeenCalledWith({ id: 3, favorite: true });
    expect(await screen.findByLabelText("Favorita")).toBeInTheDocument();

    await user.click(within(editor).getByRole("button", { name: "Excluir nota" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Excluir nota?" });
    expect(within(confirm).getByText(/histórico de versões/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    expect(backend.handlers.delete_note).not.toHaveBeenCalled();

    await user.click(within(editor).getByRole("button", { name: "Excluir nota" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: /Excluir nota/ }),
    );
    await waitFor(() => {
      expect(backend.handlers.delete_note).toHaveBeenCalledWith({ id: 3 });
    });
    expect(await screen.findByText("Nenhuma nota ainda")).toBeInTheDocument();
  });

  it("restaura uma versão do histórico", async () => {
    const user = userEvent.setup();
    const backend = mockNotesBackend([{ id: 1, title: "Plano", content: "original" }]);
    renderRoute(paths.productivity.notes);

    await user.click(await screen.findByText("Plano"));
    const content = await screen.findByLabelText("Conteúdo da nota (Markdown)");
    await user.clear(content);
    await user.type(content, "reescrito");
    await waitFor(() => {
      expect(backend.handlers.update_note).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("button", { name: "Histórico de versões" }));
    const dialog = await screen.findByRole("dialog", { name: /Histórico de “Plano”/ });
    const versions = await within(dialog).findByRole("list", { name: "Versões" });
    await user.click(within(versions).getAllByRole("button").at(-1) as HTMLElement);
    await user.click(within(dialog).getByRole("button", { name: /Restaurar esta versão/ }));

    expect(await screen.findByText("Versão restaurada")).toBeInTheDocument();
    expect(await screen.findByLabelText("Conteúdo da nota (Markdown)")).toHaveValue("original");
  });

  it("cria pasta e só exclui após confirmação", async () => {
    const user = userEvent.setup();
    const backend = mockNotesBackend(
      [{ id: 1, title: "Rust", folderId: 1 }],
      [{ name: "Estudos" }],
    );
    renderRoute(paths.productivity.notes);

    await user.click(await screen.findByRole("button", { name: "Gerenciar pastas" }));
    const dialog = await screen.findByRole("dialog", { name: "Pastas" });
    const create = within(dialog).getByRole("region", { name: "Nova pasta" });
    await user.type(within(create).getByLabelText("Nome da pasta"), "Receitas");
    await user.click(within(create).getByRole("button", { name: /Criar/ }));
    await waitFor(() => {
      expect(backend.handlers.create_note_folder).toHaveBeenCalledWith({ name: "Receitas" });
    });

    const folders = within(dialog).getByRole("list", { name: "Pastas" });
    await user.click(within(folders).getByRole("button", { name: "Excluir pasta “Estudos”" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Excluir pasta?" });
    expect(within(confirm).getByText(/1 nota ficará em “Sem pasta”/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: /Excluir pasta/ }));
    await waitFor(() => {
      expect(backend.handlers.delete_note_folder).toHaveBeenCalledWith({ id: 1 });
    });
  });
});
