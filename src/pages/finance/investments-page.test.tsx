import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { paths } from "@/app/router/paths";
import { QUANTITY_SCALE } from "@/features/finance/domain/investments";
import { toIsoDate } from "@/lib/dates";
import { mockFinanceBackend } from "@/test/fake-finance-backend";
import { renderRoute } from "@/test/render";

const today = toIsoDate(new Date());

const ACCOUNTS = [
  { name: "C6", kind: "checking" as const },
  { name: "Investimentos C6", kind: "investment" as const },
];

const cdb = {
  id: 1,
  accountId: 2,
  name: "CDB C6 110%",
  maturityDate: "2028-01-03",
  position: {
    value: 103_000,
    valueStatus: "informed" as const,
    valuedOn: "2026-09-29",
    contributed: 100_000,
    invested: 100_000,
    gain: 3_000,
    gainRate: 0.03,
    movementCount: 1,
  },
};

const stock = {
  id: 2,
  accountId: 2,
  class: "stocks" as const,
  name: "Itaúsa",
  ticker: "ITSA4",
  position: {
    value: 20_000,
    valueStatus: "not_informed" as const,
    contributed: 20_000,
    invested: 20_000,
    quantity: 200 * QUANTITY_SCALE,
    averagePrice: 1_000,
    stale: true,
    movementCount: 1,
  },
};

describe("página de Investimentos", () => {
  it("pede uma conta de investimentos antes do primeiro ativo", async () => {
    mockFinanceBackend({ accounts: [{ name: "C6" }] });
    renderRoute(paths.finance.investments);

    expect(await screen.findByText("Crie uma conta de investimentos")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Novo ativo/ })).not.toBeInTheDocument();
  });

  it("mostra a carteira por classe, o patrimônio e os valores a atualizar", async () => {
    mockFinanceBackend({
      accounts: ACCOUNTS,
      investments: {
        assets: [cdb, stock],
        totals: {
          value: 123_000,
          contributed: 120_000,
          withdrawn: 0,
          income: 0,
          invested: 120_000,
          gain: 3_000,
        },
        byClass: [
          { class: "fixed_income", value: 103_000, share: 103 / 123 },
          { class: "stocks", value: 20_000, share: 20 / 123 },
        ],
        accounts: [{ accountId: 2, balance: 100_000, netContributions: 120_000, cash: -20_000 }],
        netWorth: {
          accounts: 500_000,
          investmentCash: -20_000,
          portfolio: 123_000,
          total: 603_000,
        },
        staleCount: 1,
      },
    });
    renderRoute(paths.finance.investments);

    expect(await screen.findByText("Valor da carteira")).toBeInTheDocument();
    expect(screen.getByText("Valor da carteira").nextElementSibling).toHaveTextContent(
      "R$ 1.230,00",
    );
    expect(screen.getByText("Resultado").nextElementSibling).toHaveTextContent("+R$ 30,00");
    expect(screen.getByText("Patrimônio total").nextElementSibling).toHaveTextContent(
      "R$ 6.030,00",
    );
    expect(screen.getByText(/1 ativo está com o valor desatualizado/)).toBeInTheDocument();

    const fixed = screen.getByRole("list", { name: "Ativos de Renda fixa" });
    expect(within(fixed).getByText("CDB C6 110%")).toBeInTheDocument();
    expect(within(fixed).getByText("+R$ 30,00 (+3%)")).toBeInTheDocument();
    expect(within(fixed).getByText("Informado em 29/09/2026")).toBeInTheDocument();
    expect(within(fixed).getByText(/vence em 03\/01\/2028/)).toBeInTheDocument();

    const stocks = screen.getByRole("list", { name: "Ativos de Ações" });
    expect(within(stocks).getByText(/200 un\. · preço médio R\$ 10,00/)).toBeInTheDocument();
    expect(within(stocks).getByText("Atualizar valor")).toBeInTheDocument();

    const allocation = screen.getByRole("list", { name: "Distribuição por classe" });
    expect(within(allocation).getByText("Renda fixa")).toBeInTheDocument();
    // Aplicações sem a transferência deixam a conta negativa: a tela explica.
    expect(screen.getByText("Parado em Investimentos C6").nextElementSibling).toHaveTextContent(
      "-R$ 200,00",
    );
    expect(screen.getByText(/passam do saldo de Investimentos C6/)).toBeInTheDocument();
  });

  it("cadastra um ativo na conta de investimentos", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend({ accounts: ACCOUNTS });
    renderRoute(paths.finance.investments);

    await screen.findByText("Nenhum ativo ainda");
    await user.click(screen.getAllByRole("button", { name: /Novo ativo/ })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog", { name: "Novo ativo" });

    await user.click(within(dialog).getByRole("button", { name: /Cadastrar ativo/ }));
    expect(await within(dialog).findByText("Informe o nome do ativo.")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Nome *"), "Tesouro Selic 2029");
    await user.type(within(dialog).getByLabelText("Vencimento (opcional)"), "2029-03-01");
    await user.click(within(dialog).getByRole("button", { name: /Cadastrar ativo/ }));

    await waitFor(() => {
      expect(backend.handlers.create_investment_asset).toHaveBeenCalledWith({
        input: {
          accountId: 2,
          class: "fixed_income",
          name: "Tesouro Selic 2029",
          ticker: null,
          maturityDate: "2029-03-01",
          notes: "",
        },
      });
    });
    expect(await screen.findByText("Tesouro Selic 2029")).toBeInTheDocument();
  });

  it("registra a aplicação criando a transferência da conta corrente", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend({ accounts: ACCOUNTS, investments: { assets: [cdb] } });
    renderRoute(paths.finance.investments);

    await user.click(await screen.findByRole("button", { name: "Ações do ativo “CDB C6 110%”" }));
    await user.click(await screen.findByRole("menuitem", { name: /Registrar aplicação/ }));
    const dialog = await screen.findByRole("dialog", { name: "Registrar movimentação" });
    expect(
      within(dialog).getByText(/Cria a transferência dessa conta para Investimentos C6/),
    ).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Valor (R$) *"), "500,00");
    await user.click(within(dialog).getByRole("button", { name: /Registrar aplicação/ }));

    await waitFor(() => {
      expect(backend.handlers.create_investment_movement).toHaveBeenCalledWith({
        assetId: 1,
        input: {
          kind: "contribution",
          date: today,
          amount: 50_000,
          quantity: null,
          notes: "",
          accountId: 1,
          closesPosition: false,
        },
      });
    });
    expect(backend.transactions()).toHaveLength(1);
  });

  it("informa os valores atuais de uma vez", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend({
      accounts: ACCOUNTS,
      investments: { assets: [cdb, stock], staleCount: 1 },
    });
    renderRoute(paths.finance.investments);

    await user.click(
      (await screen.findAllByRole("button", { name: /Atualizar valores/ }))[0] as HTMLElement,
    );
    const dialog = await screen.findByRole("dialog", { name: "Atualizar valores" });
    await user.type(within(dialog).getByLabelText(/Itaúsa/), "215,50");
    await user.click(within(dialog).getByRole("button", { name: /Salvar valores/ }));

    await waitFor(() => {
      expect(backend.handlers.set_investment_valuations).toHaveBeenCalledWith({
        valuations: [{ assetId: 2, date: today, value: 21_550 }],
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("vincula uma aplicação importada a um ativo", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend({
      accounts: ACCOUNTS,
      investments: {
        assets: [cdb],
        unlinked: [
          {
            transactionId: 7,
            kind: "contribution",
            investmentAccountId: 2,
            otherAccountId: 1,
            description: "APLICACAO CDB",
            amount: 30_000,
            date: "2026-09-20",
          },
        ],
      },
    });
    renderRoute(paths.finance.investments);

    const unlinked = await screen.findByRole("list", { name: "Transferências sem ativo" });
    await user.click(within(unlinked).getByRole("button", { name: /Vincular “APLICACAO CDB”/ }));
    const dialog = await screen.findByRole("dialog", { name: /Vincular aplicação/ });
    // Único ativo da conta: já vem escolhido.
    expect(within(dialog).getByRole("radio", { name: /CDB C6 110%/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(within(dialog).getByRole("button", { name: /^Vincular$/ }));

    await waitFor(() => {
      expect(backend.handlers.link_investment_transaction).toHaveBeenCalledWith({
        assetId: 1,
        transactionId: 7,
        quantity: null,
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("list", { name: "Transferências sem ativo" })).toBeNull();
    });
  });

  it("exclui um ativo só depois da confirmação", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend({ accounts: ACCOUNTS, investments: { assets: [cdb] } });
    renderRoute(paths.finance.investments);

    await user.click(await screen.findByRole("button", { name: "Ações do ativo “CDB C6 110%”" }));
    await user.click(await screen.findByRole("menuitem", { name: /Excluir/ }));
    const confirm = await screen.findByRole("alertdialog", { name: "Excluir ativo?" });
    expect(confirm).toHaveTextContent(/log de auditoria/);
    expect(backend.handlers.delete_investment_asset).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole("button", { name: /Excluir ativo/ }));
    await waitFor(() => {
      expect(backend.handlers.delete_investment_asset).toHaveBeenCalledWith({ id: 1 });
    });
  });
});
