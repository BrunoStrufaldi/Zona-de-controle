import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { paths } from "@/app/router/paths";
import { monthOf, shiftMonth } from "@/features/finance/domain/period";
import { toIsoDate } from "@/lib/dates";
import { mockFinanceBackend } from "@/test/fake-finance-backend";
import { renderRoute } from "@/test/render";

const today = toIsoDate(new Date());
const thisMonth = monthOf(today);
const due = `${thisMonth}-05`;

const rent = {
  id: 1,
  description: "Aluguel",
  amount: 200_000,
  categoryId: 1,
  startDate: `${shiftMonth(thisMonth, -2)}-05`,
  monthlyAmount: 200_000,
};

describe("página de Recorrentes", () => {
  it("pede uma conta antes da primeira recorrente", async () => {
    mockFinanceBackend();
    renderRoute(paths.finance.recurring);

    expect(await screen.findByText("Cadastre uma conta primeiro")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nova recorrente/ })).not.toBeInTheDocument();
  });

  it("cria uma recorrente mensal pelo formulário", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend({ accounts: [{ name: "C6" }] });
    renderRoute(paths.finance.recurring);

    await screen.findByText("Nenhuma recorrente ainda");
    await user.click(screen.getAllByRole("button", { name: /Nova recorrente/ })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog", { name: "Nova recorrente" });

    await user.click(within(dialog).getByRole("button", { name: /Criar recorrente/ }));
    expect(await within(dialog).findByText("Informe uma descrição.")).toBeInTheDocument();
    expect(backend.handlers.create_recurring).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Descrição *"), "Internet");
    await user.type(within(dialog).getByLabelText("Valor previsto (R$) *"), "99,90");
    await user.click(within(dialog).getByRole("button", { name: /Criar recorrente/ }));

    await waitFor(() => {
      expect(backend.handlers.create_recurring).toHaveBeenCalledWith({
        input: expect.objectContaining({
          kind: "expense",
          description: "Internet",
          amount: 9_990,
          accountId: 1,
          startDate: today,
          recurrence: { frequency: "monthly", interval: 1, until: null, count: null },
        }) as unknown,
      });
    });
    const series = await screen.findByRole("list", { name: "Recorrentes" });
    expect(within(series).getByText("Internet")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mostra o resumo e registra um vencimento como pago", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend({
      accounts: [{ name: "C6" }],
      recurring: { series: [rent], occurrences: [{ recurringId: 1, occurrenceDate: due }] },
    });
    renderRoute(paths.finance.recurring);

    const list = await screen.findByRole("list", { name: /^Vencimentos de / });
    expect(within(list).getByText("A pagar")).toBeInTheDocument();
    expect(screen.getByText("Contas fixas por mês").nextElementSibling).toHaveTextContent(
      "R$ 2.000,00",
    );

    await user.click(within(list).getByRole("button", { name: /^Pagar “Aluguel”/ }));
    await waitFor(() => {
      expect(backend.handlers.register_recurring_occurrence).toHaveBeenCalledWith({
        id: 1,
        occurrenceDate: due,
        input: expect.objectContaining({
          description: "Aluguel",
          amount: 200_000,
          date: due,
          status: "paid",
          categoryId: 1,
        }) as unknown,
      });
    });
    expect(await within(list).findByText("Pago")).toBeInTheDocument();
    expect(backend.transactions()).toHaveLength(1);
    expect(backend.transactions()[0]?.recurringId).toBe(1);
  });

  it("registra com outro valor, pula e desfaz", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend({
      accounts: [{ name: "C6" }],
      recurring: {
        series: [rent, { id: 2, description: "Academia", amount: 12_000 }],
        occurrences: [
          { recurringId: 1, occurrenceDate: due },
          { recurringId: 2, occurrenceDate: `${thisMonth}-10`, amount: 12_000 },
        ],
      },
    });
    renderRoute(paths.finance.recurring);

    const list = await screen.findByRole("list", { name: /^Vencimentos de / });
    await user.click(within(list).getByRole("button", { name: /Ações do vencimento “Aluguel”/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Registrar com outro valor/ }));
    const dialog = await screen.findByRole("dialog", { name: "Registrar vencimento" });
    // O tipo é o da recorrente.
    expect(within(dialog).queryByRole("tablist")).not.toBeInTheDocument();
    const amount = within(dialog).getByLabelText("Valor (R$) *");
    expect(amount).toHaveValue("2000,00");
    await user.clear(amount);
    await user.type(amount, "2.100,00");
    await user.click(within(dialog).getByRole("button", { name: /Registrar lançamento/ }));
    await waitFor(() => {
      expect(backend.handlers.register_recurring_occurrence).toHaveBeenCalledWith({
        id: 1,
        occurrenceDate: due,
        input: expect.objectContaining({ amount: 210_000 }) as unknown,
      });
    });

    await user.click(within(list).getByRole("button", { name: /Ações do vencimento “Academia”/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Pular este vencimento/ }));
    expect(await within(list).findByText("Pulada")).toBeInTheDocument();
    await user.click(within(list).getByRole("button", { name: /Desfazer o pulo de “Academia”/ }));
    await waitFor(() => {
      expect(backend.handlers.reopen_recurring_occurrence).toHaveBeenCalledWith({
        id: 2,
        occurrenceDate: `${thisMonth}-10`,
      });
    });
    expect(await within(list).findAllByText("A pagar")).toHaveLength(1);
  });

  it("vincula um vencimento a um lançamento que já existia", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend({
      accounts: [{ name: "C6" }],
      transactions: [
        { id: 7, description: "PIX IMOBILIARIA", amount: 200_000, date: due },
        { id: 8, description: "Salário", kind: "income", amount: 800_000, date: due },
      ],
      recurring: { series: [rent], occurrences: [{ recurringId: 1, occurrenceDate: due }] },
    });
    renderRoute(paths.finance.recurring);

    const list = await screen.findByRole("list", { name: /^Vencimentos de / });
    await user.click(within(list).getByRole("button", { name: /Ações do vencimento “Aluguel”/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Vincular a um lançamento/ }));
    const dialog = await screen.findByRole("dialog", { name: "Vincular a um lançamento" });
    const candidates = await within(dialog).findByRole("list", {
      name: "Lançamentos para vincular",
    });
    // Só saídas: a entrada não aparece.
    expect(within(candidates).getAllByRole("listitem")).toHaveLength(1);
    await user.click(
      within(candidates).getByRole("button", { name: /Vincular “PIX IMOBILIARIA”/ }),
    );

    await waitFor(() => {
      expect(backend.handlers.link_recurring_occurrence).toHaveBeenCalledWith({
        id: 1,
        occurrenceDate: due,
        transactionId: 7,
      });
    });
    expect(await within(list).findByText("Pago")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mostra os atrasados de meses anteriores e exclui a recorrente com confirmação", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend({
      accounts: [{ name: "C6" }],
      recurring: {
        series: [{ ...rent, overdueCount: 1, endsSoon: true, lastDate: `${thisMonth}-25` }],
        occurrences: [
          { recurringId: 1, occurrenceDate: `${shiftMonth(thisMonth, -1)}-05`, status: "overdue" },
        ],
      },
    });
    renderRoute(paths.finance.recurring);

    const overdue = await screen.findByRole("list", {
      name: "Vencimentos atrasados de meses anteriores",
    });
    expect(within(overdue).getByText("Atrasada")).toBeInTheDocument();
    const series = screen.getByRole("list", { name: "Recorrentes" });
    expect(within(series).getByText(/renovar\?/)).toBeInTheDocument();

    await user.click(within(series).getByRole("button", { name: /Ações da recorrente “Aluguel”/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Excluir/ }));
    const confirm = await screen.findByRole("alertdialog", { name: "Excluir recorrente?" });
    expect(confirm).toHaveTextContent("continuam em Lançamentos");
    await user.click(within(confirm).getByRole("button", { name: /Excluir recorrente/ }));

    await waitFor(() => {
      expect(backend.handlers.delete_recurring).toHaveBeenCalledWith({ id: 1 });
    });
    expect(await screen.findByText("Nenhuma recorrente ainda")).toBeInTheDocument();
  });
});
