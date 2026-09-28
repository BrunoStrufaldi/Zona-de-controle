import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";

import { paths } from "@/app/router/paths";
import { monthOf, shiftMonth } from "@/features/finance/domain/period";
import { toIsoDate } from "@/lib/dates";
import { mockFinanceBackend } from "@/test/fake-finance-backend";
import { preloadFinanceOverview, renderRoute } from "@/test/render";

const thisMonth = monthOf(toIsoDate(new Date()));

describe("página Visão Geral das Finanças", () => {
  beforeAll(preloadFinanceOverview);

  it("resume o mês, as contas e as despesas por categoria", async () => {
    mockFinanceBackend({
      accounts: [
        { name: "C6", openingBalance: 100_000 },
        { name: "Carteira", kind: "cash" },
      ],
      transactions: [
        { id: 1, kind: "income", amount: 800_000, date: `${thisMonth}-05`, categoryId: 11 },
        { id: 2, amount: 200_000, date: `${thisMonth}-05`, categoryId: 1, status: "pending" },
        { id: 3, amount: 50_000, date: `${thisMonth}-10`, categoryId: 2 },
      ],
    });
    renderRoute(paths.finance.overview);

    const metrics = (await screen.findByText("Saldo líquido")).closest("dl") as HTMLElement;
    expect(within(metrics).getByText("R$ 8.000,00")).toBeInTheDocument();
    expect(within(metrics).getByText("R$ 2.500,00")).toBeInTheDocument();
    expect(within(metrics).getByText("R$ 2.000,00 a pagar")).toBeInTheDocument();
    expect(within(metrics).getByText("R$ 5.500,00")).toBeInTheDocument();
    expect(within(metrics).getByText("68,8%")).toBeInTheDocument();

    // Saldo só com pagos: 1.000 + 8.000 − 500 (o aluguel está pendente).
    const balances = screen.getByRole("list", { name: "Saldos das contas" });
    expect(within(balances).getByText("R$ 8.500,00")).toBeInTheDocument();
    expect(screen.getByText("Saldo total").nextElementSibling).toHaveTextContent("R$ 8.500,00");

    const byCategory = screen.getByRole("list", { name: "Despesas por categoria" });
    const rows = within(byCategory).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Moradia");
    expect(rows[0]).toHaveTextContent("80%");
    expect(rows[1]).toHaveTextContent("Alimentação");
  });

  it("navega para o mês anterior", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend({ accounts: [{ name: "C6" }] });
    renderRoute(paths.finance.overview);

    await screen.findByText("Nenhuma despesa neste mês");
    await user.click(screen.getByRole("button", { name: "Mês anterior" }));

    expect(backend.handlers.get_finance_overview).toHaveBeenLastCalledWith({
      month: shiftMonth(thisMonth, -1),
    });
  });
});
