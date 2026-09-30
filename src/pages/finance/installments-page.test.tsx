import { screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { paths } from "@/app/router/paths";
import { type CommitmentMonth, type InstallmentPurchase } from "@/features/finance/types";
import { mockFinanceBackend } from "@/test/fake-finance-backend";
import { preloadInstallments, renderRoute } from "@/test/render";

function purchase(partial: Partial<InstallmentPurchase>): InstallmentPurchase {
  return {
    id: "1:2026-06-03:geladeira:10",
    accountId: 1,
    categoryId: 1,
    description: "Geladeira",
    purchaseDate: "2026-06-03",
    installmentAmount: 30_000,
    count: 10,
    paid: 3,
    current: 4,
    remaining: 7,
    remainingAmount: 210_000,
    totalAmount: 300_000,
    imported: 2,
    firstDueDate: "2026-07-05",
    nextDueDate: "2026-10-05",
    finalDueDate: "2027-04-05",
    finished: false,
    ...partial,
  };
}

function month(value: string, partial: Partial<CommitmentMonth> = {}): CommitmentMonth {
  return { month: value, installments: 0, parcels: 0, recurring: 0, ending: [], ...partial };
}

describe("página de Parcelamentos", () => {
  beforeAll(preloadInstallments);

  it("explica de onde vêm as parcelas quando não há nenhuma", async () => {
    mockFinanceBackend({ accounts: [{ name: "Cartão C6", kind: "credit_card" }] });
    renderRoute(paths.finance.installments);

    expect(await screen.findByText("Nenhuma compra parcelada ainda")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ir para Lançamentos/ })).toBeInTheDocument();
  });

  it("mostra as compras, o que falta e o compromisso mês a mês", async () => {
    const fridge = purchase({});
    const course = purchase({
      id: "1:2026-01-10:curso:3",
      description: "Curso",
      count: 3,
      paid: 3,
      current: null,
      remaining: 0,
      remainingAmount: 0,
      totalAmount: 90_000,
      finalDueDate: "2026-08-05",
      finished: true,
    });
    const { handlers } = mockFinanceBackend({
      accounts: [
        { name: "Cartão C6", kind: "credit_card" },
        { name: "Nubank", kind: "credit_card" },
      ],
      installments: {
        today: "2026-09-29",
        purchases: [fridge, course],
        months: [
          month("2026-09", { installments: 30_000, parcels: 1, recurring: 5_590 }),
          month("2026-10", { installments: 30_000, parcels: 1, recurring: 5_590 }),
          month("2027-04", { installments: 30_000, parcels: 1, ending: [fridge.id] }),
          month("2027-05"),
        ],
        summary: {
          activePurchases: 1,
          remainingParcels: 7,
          remainingAmount: 210_000,
          currentMonth: 35_590,
        },
        finalMonth: "2027-04",
        cardsWithoutCycle: [2],
      },
    });
    renderRoute(paths.finance.installments);

    const active = await screen.findByRole("list", { name: "Compras parceladas em andamento" });
    expect(handlers.get_installments_overview).toHaveBeenCalled();
    expect(within(active).getByText("Geladeira")).toBeInTheDocument();
    expect(within(active).getByLabelText("Parcela 4 de 10")).toBeInTheDocument();
    expect(within(active).getByText(/faltam R\$ 2\.100,00/)).toBeInTheDocument();
    expect(within(active).getByText("faltam 7 parcelas")).toBeInTheDocument();

    expect(screen.getByText("Falta pagar em parcelas").nextElementSibling).toHaveTextContent(
      "R$ 2.100,00",
    );
    expect(screen.getByText("Última parcela").nextElementSibling).toHaveTextContent(
      "abril de 2027",
    );
    // Cartão sem os dias da fatura: recorrentes dele ficam de fora do gráfico.
    expect(screen.getByText(/Recorrentes de Nubank ficam de fora/)).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "Compromisso das faturas mês a mês" });
    const april = within(table).getByRole("row", { name: /abril de 2027/ });
    expect(april).toHaveTextContent("Geladeira");
    // Maio alivia a parcela que terminou em abril.
    const may = within(table).getByRole("row", { name: /maio de 2027/ });
    expect(may).toHaveTextContent("−R$ 300,00");

    const done = screen.getByRole("list", { name: "Compras parceladas quitadas" });
    expect(within(done).getByText("Curso")).toBeInTheDocument();
    expect(within(done).getByText("quitada")).toBeInTheDocument();
  });
});
