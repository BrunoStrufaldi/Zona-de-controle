import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { paths } from "@/app/router/paths";
import { formatDate } from "@/lib/format";
import { mockRoutinesBackend } from "@/test/fake-routines-backend";
import { renderRoute } from "@/test/render";

describe("página de Rotinas", () => {
  it("cria a primeira rotina com dias e hábitos", async () => {
    const user = userEvent.setup();
    const backend = mockRoutinesBackend();
    renderRoute(paths.productivity.routines);

    await screen.findByText("Nenhuma rotina ainda");
    await user.click(screen.getAllByRole("button", { name: /Nova rotina/ })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog", { name: "Nova rotina" });

    // Nome e hábito são obrigatórios.
    await user.click(within(dialog).getByRole("button", { name: /Criar rotina/ }));
    expect(await within(dialog).findByText("Informe um nome.")).toBeInTheDocument();
    expect(within(dialog).getByText("Adicione pelo menos um hábito.")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Nome *"), "Academia");
    // Troca "todo dia" por seg/qua/sex.
    await user.click(within(dialog).getByRole("button", { name: "Todo dia" }));
    for (const day of ["segunda-feira", "quarta-feira", "sexta-feira"]) {
      await user.click(within(dialog).getByRole("button", { name: day }));
    }
    await user.type(within(dialog).getByLabelText("Hábito 1"), "Treinar");
    await user.click(within(dialog).getByRole("button", { name: /Adicionar hábito/ }));
    await user.type(within(dialog).getByLabelText("Hábito 2"), "Alongar");
    await user.click(within(dialog).getByRole("button", { name: /Criar rotina/ }));

    await waitFor(() => {
      expect(backend.handlers.create_routine).toHaveBeenCalledWith({
        input: {
          name: "Academia",
          weekdays: [1, 3, 5],
          habits: [
            { id: null, name: "Treinar" },
            { id: null, name: "Alongar" },
          ],
        },
      });
    });
    const card = await screen.findByRole("article", { name: "Rotina Academia" });
    expect(within(card).getByText("seg, qua, sex")).toBeInTheDocument();
  });

  it("marca hábitos de hoje e de dias anteriores na grade", async () => {
    const user = userEvent.setup();
    const backend = mockRoutinesBackend([
      { name: "Manhã", habits: ["Água", "Alongar"], done: { 1: [0, 1] } },
    ]);
    renderRoute(paths.productivity.routines);

    const card = await screen.findByRole("article", { name: "Rotina Manhã" });
    // Ontem completo; hoje ainda em andamento não quebra a sequência.
    expect(within(card).getByTitle("Sequência")).toHaveTextContent("1 dia");

    const today = backend.today;
    await user.click(within(card).getByRole("checkbox", { name: `Água em ${formatDate(today)}` }));
    expect(backend.handlers.set_habit_done).toHaveBeenCalledWith({
      habitId: 1,
      date: today,
      done: true,
    });
    await user.click(
      within(card).getByRole("checkbox", { name: `Alongar em ${formatDate(today)}` }),
    );

    // Ontem e hoje completos: 2 dias seguidos.
    await waitFor(() => {
      expect(within(card).getByTitle("Sequência")).toHaveTextContent("2 dias");
    });
  });

  it("não oferece marcação em dias fora da agenda", async () => {
    mockRoutinesBackend([{ name: "Nova", habits: ["Ler"], startedDaysAgo: 0 }]);
    renderRoute(paths.productivity.routines);

    const card = await screen.findByRole("article", { name: "Rotina Nova" });
    // Só hoje é marcável: a rotina começou hoje.
    expect(within(card).getAllByRole("checkbox")).toHaveLength(1);
  });

  it("edita mantendo hábitos existentes e só exclui após confirmação", async () => {
    const user = userEvent.setup();
    const backend = mockRoutinesBackend([{ name: "Noite", habits: ["Ler", "Meditar"] }]);
    renderRoute(paths.productivity.routines);

    await user.click(await screen.findByRole("button", { name: "Ações da rotina “Noite”" }));
    await user.click(await screen.findByRole("menuitem", { name: /Editar/ }));
    const dialog = await screen.findByRole("dialog", { name: "Editar rotina" });
    expect(
      within(dialog).getByText(/o histórico dos dias anteriores é mantido/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Remover hábito 2" }));
    await user.click(within(dialog).getByRole("button", { name: /Salvar alterações/ }));
    await waitFor(() => {
      expect(backend.handlers.update_routine).toHaveBeenCalledWith({
        id: 1,
        input: expect.objectContaining({ habits: [{ id: 1, name: "Ler" }] }) as unknown,
      });
    });

    await user.click(screen.getByRole("button", { name: "Ações da rotina “Noite”" }));
    await user.click(await screen.findByRole("menuitem", { name: /Excluir/ }));
    const confirm = await screen.findByRole("alertdialog", { name: "Excluir rotina?" });
    expect(within(confirm).getByText(/histórico de marcações/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    expect(backend.handlers.delete_routine).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Ações da rotina “Noite”" }));
    await user.click(await screen.findByRole("menuitem", { name: /Excluir/ }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: /Excluir rotina/,
      }),
    );
    await waitFor(() => {
      expect(backend.handlers.delete_routine).toHaveBeenCalledWith({ id: 1 });
    });
    expect(await screen.findByText("Nenhuma rotina ainda")).toBeInTheDocument();
  });
});
