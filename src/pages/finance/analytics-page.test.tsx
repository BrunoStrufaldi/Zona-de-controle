import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";

import { paths } from "@/app/router/paths";
import { analyticsSpan, monthName } from "@/features/finance/domain/analytics";
import { shiftMonth } from "@/features/finance/domain/period";
import { type AnalyticsMonth } from "@/features/finance/types";
import { toIsoDate } from "@/lib/dates";
import { mockFinanceBackend } from "@/test/fake-finance-backend";
import { preloadAnalytics, renderRoute } from "@/test/render";

const today = toIsoDate(new Date());
const span = analyticsSpan("12m", today);

/** Os 12 meses do período; só os 3 últimos têm movimento e patrimônio. */
function months(): AnalyticsMonth[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = shiftMonth(span.from, index);
    const recent = index >= 9;
    return {
      month,
      income: recent ? 800_000 : 0,
      expenses: recent ? 500_000 : 0,
      net: recent ? 300_000 : 0,
      netWorth: recent
        ? {
            accounts: 1_000_000 + (index - 9) * 300_000,
            investments: 500_000,
            total: 1_500_000 + (index - 9) * 300_000,
          }
        : null,
    };
  });
}

describe("página Analytics", () => {
  beforeAll(preloadAnalytics);

  it("mostra o resumo, o patrimônio e as categorias do período", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend({
      analytics: {
        today,
        totals: {
          income: 2_400_000,
          expenses: 1_500_000,
          net: 900_000,
          averageIncome: 800_000,
          averageExpenses: 500_000,
          averageMonths: 11,
        },
        months: months(),
        categories: [
          {
            categoryId: 1,
            total: 900_000,
            previousTotal: 600_000,
            months: [...Array<number>(9).fill(0), 300_000, 300_000, 300_000],
          },
          {
            categoryId: 2,
            total: 600_000,
            previousTotal: 0,
            months: [...Array<number>(9).fill(0), 100_000, 200_000, 300_000],
          },
        ],
      },
    });
    renderRoute(paths.finance.analytics);

    await screen.findByText("Resumo do período");
    expect(backend.handlers.get_finance_analytics).toHaveBeenCalledWith(span);
    const metrics = screen.getByText("Patrimônio", { selector: "dt" }).closest("dl") as HTMLElement;
    expect(within(metrics).getByText("R$ 24.000,00")).toBeInTheDocument();
    expect(within(metrics).getByText("média de R$ 5.000,00/mês")).toBeInTheDocument();
    expect(within(metrics).getByText("37,5% da receita")).toBeInTheDocument();
    // Patrimônio no último mês conhecido e a variação desde o primeiro.
    expect(within(metrics).getByText("R$ 21.000,00")).toBeInTheDocument();
    expect(
      within(metrics).getByText(`+R$ 6.000,00 desde ${monthName(shiftMonth(span.from, 9))}`),
    ).toBeInTheDocument();
    expect(screen.getByText(/o mês atual, ainda em andamento, fica de fora/)).toBeInTheDocument();

    // A tabela do patrimônio só tem os meses com registro.
    const netWorth = screen.getByRole("table", { name: "Patrimônio ao fim de cada mês" });
    expect(within(netWorth).getAllByRole("row")).toHaveLength(4);

    const categories = screen.getByRole("list", { name: "Despesas por categoria" });
    const [housing, food] = within(categories).getAllByRole("button");
    expect(housing).toHaveTextContent("Moradia");
    expect(housing).toHaveTextContent("+50%");
    expect(housing).toHaveTextContent("60%");
    expect(housing).toHaveAttribute("aria-pressed", "true");
    expect(food).toHaveTextContent("sem gastos antes");
    expect(screen.getByRole("heading", { name: "Moradia · mês a mês" })).toBeInTheDocument();

    await user.click(food as HTMLElement);
    expect(food).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Alimentação · mês a mês" })).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Despesas de Alimentação por mês" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Ano passado" }));
    expect(backend.handlers.get_finance_analytics).toHaveBeenLastCalledWith(
      analyticsSpan("last-year", today),
    );
  });

  it("sem lançamentos no período, orienta a registrar", async () => {
    mockFinanceBackend();
    renderRoute(paths.finance.analytics);
    expect(await screen.findByText("Nada para analisar neste período")).toBeInTheDocument();
  });

  it("projeta os próximos meses com a estimativa separada", async () => {
    const user = userEvent.setup();
    const flows = { recurring: 0, installments: 0, scheduled: 0, estimated: 0 };
    const backend = mockFinanceBackend({
      accounts: [{ name: "C6" }, { name: "Cartão C6", kind: "credit_card" }],
      projection: {
        startBalance: 400_000,
        months: [
          {
            month: "2026-09",
            income: { ...flows, estimated: 6_000 },
            expenses: { ...flows, scheduled: 15_000, estimated: 25_000 },
            balanceKnown: 385_000,
            balance: 366_000,
          },
          {
            month: "2026-10",
            income: { ...flows, recurring: 800_000, estimated: 6_000 },
            expenses: {
              recurring: 200_000,
              installments: 10_000,
              scheduled: 30_000,
              estimated: 30_000,
            },
            balanceKnown: 945_000,
            balance: 902_000,
          },
          {
            month: "2026-11",
            income: { ...flows, estimated: 6_000 },
            expenses: { ...flows, estimated: 60_000 },
            balanceKnown: 945_000,
            balance: 848_000,
          },
        ],
        estimate: { months: 6, income: 6_000, expenses: 60_000 },
        installmentsFinalMonth: "2026-10",
        cardsWithoutCycle: [2],
        unlinkedRecurring: 2,
      },
    });
    const { router } = renderRoute(paths.finance.analytics);

    await user.click(await screen.findByRole("tab", { name: /Projeção/ }));
    expect(router.state.location.search).toBe("?tab=projection");
    await screen.findByText("Próximos 6 meses");
    expect(backend.handlers.get_finance_projection).toHaveBeenCalled();

    const metrics = screen.getByText("Saldo hoje", { selector: "dt" }).closest("dl") as HTMLElement;
    expect(within(metrics).getByText("R$ 4.000,00")).toBeInTheDocument();
    expect(within(metrics).getByText("R$ 8.480,00")).toBeInTheDocument();
    expect(within(metrics).getByText("só com os conhecidos: R$ 9.450,00")).toBeInTheDocument();
    expect(within(metrics).getByText("no fim de setembro de 2026")).toBeInTheDocument();
    expect(within(metrics).getByText("a última em outubro de 2026")).toBeInTheDocument();
    expect(screen.getByText(/média de R\$ 600,00 em gastos/)).toBeInTheDocument();
    expect(screen.getByText(/Cartão C6 sem os dias da fatura/)).toBeInTheDocument();
    expect(
      screen.getByText(/2 vencimentos de recorrentes dos últimos meses sem lançamento vinculado/),
    ).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "Projeção mês a mês" });
    const october = within(table).getByRole("row", { name: /outubro de 2026/ });
    expect(october).toHaveTextContent("R$ 2.400,00");
    expect(october).toHaveTextContent(
      "recorrentes R$ 2.000,00 · parcelas R$ 100,00 · lançados R$ 300,00",
    );
    // Avulsos: 60,00 estimados de receita − 300,00 de gastos.
    expect(october).toHaveTextContent("-R$ 240,00");
    expect(within(table).getByText("estimativa")).toBeInTheDocument();

    const reliefs = screen.getByRole("list", { name: "Quando as parcelas diminuem" });
    expect(within(reliefs).getByText("R$ 100,00 a menos")).toBeInTheDocument();
  });
});
