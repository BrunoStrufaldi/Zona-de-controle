import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { paths, weeklyPlanHref } from "@/app/router/paths";
import { type PlanBlock } from "@/features/productivity/weekly-plan/types";
import { mockWeeklyPlanBackend } from "@/test/fake-weekly-plan-backend";
import { renderRoute } from "@/test/render";

const WORK: PlanBlock = {
  id: 1,
  title: "Trabalho HomeOffice",
  notes: "",
  weekdays: [1, 3, 5],
  startTime: "08:00",
  endTime: "15:00",
  color: "blue",
};

const WEEKEND: PlanBlock = {
  id: 2,
  title: "Estudar pelo menos 1h",
  notes: "Academia fica aberta até 17h",
  weekdays: [6],
  startTime: null,
  endTime: null,
  color: "green",
};

describe("planejamento semanal (aba de Rotinas)", () => {
  it("abre pela aba e cria um bloco para vários dias", async () => {
    const user = userEvent.setup();
    const { handlers } = mockWeeklyPlanBackend();
    const { router } = renderRoute(paths.productivity.routines);

    await user.click(await screen.findByRole("tab", { name: /Planejamento semanal/ }));
    expect(router.state.location.search).toBe("?tab=plan");
    await screen.findByText("Nenhum bloco no planejamento");

    await user.click(screen.getByRole("button", { name: /Novo bloco/ }));
    const dialog = await screen.findByRole("dialog", { name: "Novo bloco" });
    await user.click(within(dialog).getByRole("button", { name: /Salvar/ }));
    expect(within(dialog).getByText("Informe o título.")).toBeInTheDocument();
    expect(within(dialog).getByText("Escolha pelo menos um dia.")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Título *"), "Faculdade");
    await user.click(within(dialog).getByRole("button", { name: "Seg a sex" }));
    const start = within(dialog).getByLabelText("Início");
    await user.clear(start);
    await user.type(start, "18:30");
    const end = within(dialog).getByLabelText("Fim");
    await user.clear(end);
    await user.type(end, "22:30");
    await user.click(within(dialog).getByRole("button", { name: /Salvar/ }));

    await waitFor(() => {
      expect(handlers.create_plan_block).toHaveBeenCalledWith({
        input: {
          title: "Faculdade",
          notes: "",
          weekdays: [1, 2, 3, 4, 5],
          startTime: "18:30",
          endTime: "22:30",
          color: "blue",
        },
      });
    });
    expect(
      await screen.findAllByRole("button", { name: /^Faculdade, .*, 18:30–22:30/ }),
    ).toHaveLength(5);
    expect(
      screen.getByRole("button", { name: "Faculdade, sexta-feira, 18:30–22:30" }),
    ).toBeVisible();
  });

  it("mostra os blocos na grade e o conflito de horário sem fechar o formulário", async () => {
    const user = userEvent.setup();
    mockWeeklyPlanBackend([WORK, WEEKEND]);
    renderRoute(weeklyPlanHref);

    const wednesday = await screen.findByRole("group", { name: "Horários de quarta-feira" });
    expect(
      within(wednesday).getByRole("button", {
        name: /^Trabalho HomeOffice, quarta-feira, 08:00–15:00/,
      }),
    ).toBeInTheDocument();
    const saturday = screen.getByRole("group", { name: "Dia inteiro: sábado" });
    expect(within(saturday).getByText("Academia fica aberta até 17h")).toBeInTheDocument();

    // Clicar num horário vazio abre o formulário com o dia já marcado.
    await user.click(wednesday);
    const dialog = await screen.findByRole("dialog", { name: "Novo bloco" });
    expect(within(dialog).getByRole("button", { name: "quarta-feira" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.type(within(dialog).getByLabelText("Título *"), "Inglês");
    const start = within(dialog).getByLabelText("Início");
    await user.clear(start);
    await user.type(start, "14:00");
    const end = within(dialog).getByLabelText("Fim");
    await user.clear(end);
    await user.type(end, "16:00");
    await user.click(within(dialog).getByRole("button", { name: /Salvar/ }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "o horário conflita com “Trabalho HomeOffice”",
    );
    expect(dialog).toBeInTheDocument();
  });

  it("edita e exclui um bloco com confirmação", async () => {
    const user = userEvent.setup();
    const { handlers, blocks } = mockWeeklyPlanBackend([WORK, WEEKEND]);
    renderRoute(weeklyPlanHref);

    await user.click(
      await screen.findByRole("button", { name: /^Trabalho HomeOffice, segunda-feira/ }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Editar bloco" });
    const title = within(dialog).getByLabelText("Título *");
    await user.clear(title);
    await user.type(title, "Trabalho presencial");
    await user.click(within(dialog).getByRole("button", { name: /Salvar/ }));
    await waitFor(() => {
      expect(handlers.update_plan_block).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findAllByRole("button", { name: /^Trabalho presencial,/ })).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: /^Estudar pelo menos 1h, sábado/ }));
    const edit = await screen.findByRole("dialog", { name: "Editar bloco" });
    expect(within(edit).getByLabelText("Dia inteiro (anotação, sem horário)")).toBeChecked();
    await user.click(within(edit).getByRole("button", { name: /Excluir/ }));
    const confirm = await screen.findByRole("alertdialog", { name: "Excluir bloco?" });
    expect(confirm).toHaveTextContent("“Estudar pelo menos 1h” (sáb, dia inteiro)");
    expect(confirm).toHaveTextContent("log de auditoria");
    await user.click(within(confirm).getByRole("button", { name: /Excluir bloco/ }));

    await waitFor(() => {
      expect(handlers.delete_plan_block).toHaveBeenCalledWith({ id: 2 });
    });
    expect(blocks()).toHaveLength(1);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Estudar pelo menos 1h/ })).toBeNull();
    });
  });
});
