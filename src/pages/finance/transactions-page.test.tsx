import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { newTransactionHref, paths } from "@/app/router/paths";
import { monthOf, shiftMonth } from "@/features/finance/domain/period";
import { toIsoDate } from "@/lib/dates";
import { type ImportPreview, type PreviewLine } from "@/features/finance/types";
import { mockFinanceBackend } from "@/test/fake-finance-backend";
import { renderRoute } from "@/test/render";

const today = toIsoDate(new Date());
const thisMonth = monthOf(today);

describe("página de Lançamentos", () => {
  it("pede uma conta antes do primeiro lançamento e a cria", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend();
    renderRoute(paths.finance.transactions);

    await screen.findByText("Cadastre sua primeira conta");
    expect(screen.queryByRole("button", { name: /Novo lançamento/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Nova conta/ }));

    const dialog = await screen.findByRole("dialog", { name: "Contas" });
    await user.type(within(dialog).getByLabelText("Nome"), "  C6 ");
    await user.type(within(dialog).getByLabelText("Saldo inicial (R$)"), "1.500,00");
    await user.click(within(dialog).getByRole("button", { name: /Adicionar conta/ }));

    await waitFor(() => {
      expect(backend.handlers.create_finance_account).toHaveBeenCalledWith({
        input: expect.objectContaining({ name: "C6", openingBalance: 150_000 }) as unknown,
      });
    });
    expect(await within(dialog).findByLabelText("Saldo de C6")).toHaveTextContent("R$ 1.500,00");
  });

  it("cadastra um cartão com os dias de fechamento e vencimento da fatura", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend({ accounts: [{ name: "C6" }] });
    renderRoute(paths.finance.transactions);

    await user.click(await screen.findByRole("button", { name: /^Contas$/ }));
    const dialog = await screen.findByRole("dialog", { name: "Contas" });
    const form = within(dialog).getByRole("region", { name: "Nova conta" });
    await user.type(within(form).getByLabelText("Nome"), "Cartão C6");
    // Os dias só aparecem para cartão de crédito.
    expect(within(form).queryByLabelText("Fecha no dia")).not.toBeInTheDocument();
    await user.click(within(form).getByLabelText("Tipo"));
    await user.click(await screen.findByRole("option", { name: "Cartão de crédito" }));
    await user.type(within(form).getByLabelText("Fecha no dia"), "28");
    await user.click(within(form).getByRole("button", { name: /Adicionar conta/ }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(/os dois vazios/);

    await user.type(within(form).getByLabelText("Vence no dia"), "5");
    await user.click(within(form).getByRole("button", { name: /Adicionar conta/ }));
    await waitFor(() => {
      expect(backend.handlers.create_finance_account).toHaveBeenCalledWith({
        input: expect.objectContaining({
          name: "Cartão C6",
          kind: "credit_card",
          closingDay: 28,
          dueDay: 5,
        }) as unknown,
      });
    });
    expect(await within(dialog).findByText(/fecha dia 28, vence dia 5/)).toBeInTheDocument();
  });

  it("cria um lançamento pelo formulário, com o valor em centavos", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend({ accounts: [{ name: "C6" }] });
    renderRoute(paths.finance.transactions);

    await screen.findByText(/Nenhum lançamento em/);
    await user.click(screen.getAllByRole("button", { name: /Novo lançamento/ })[0] as HTMLElement);

    const dialog = await screen.findByRole("dialog", { name: "Novo lançamento" });
    // Obrigatórios: nada é enviado sem descrição e valor.
    await user.click(within(dialog).getByRole("button", { name: /Criar lançamento/ }));
    expect(await within(dialog).findByText("Informe uma descrição.")).toBeInTheDocument();
    expect(within(dialog).getByText("Informe o valor.")).toBeInTheDocument();
    expect(backend.handlers.create_transaction).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Descrição *"), "Mercado");
    await user.type(within(dialog).getByLabelText("Valor (R$) *"), "453,90");
    await user.type(within(dialog).getByLabelText("Tags"), "Casa{Enter}");
    await user.click(within(dialog).getByRole("button", { name: /Criar lançamento/ }));

    await waitFor(() => {
      expect(backend.handlers.create_transaction).toHaveBeenCalledWith({
        input: expect.objectContaining({
          accountId: 1,
          kind: "expense",
          description: "Mercado",
          amount: 45_390,
          date: today,
          status: "paid",
          tags: ["casa"],
        }) as unknown,
      });
    });
    const list = await screen.findByRole("list", { name: "Lançamentos" });
    expect(within(list).getByText("Mercado")).toBeInTheDocument();
    expect(within(list).getByText(/R\$ 453,90/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("abre o formulário pelo link do menu Criar", async () => {
    mockFinanceBackend({ accounts: [{ name: "C6" }] });
    renderRoute(newTransactionHref);

    expect(await screen.findByRole("dialog", { name: "Novo lançamento" })).toBeInTheDocument();
  });

  it("mostra o período, os totais e filtra", async () => {
    const user = userEvent.setup();
    mockFinanceBackend({
      accounts: [{ name: "C6" }],
      transactions: [
        {
          id: 1,
          description: "Salário",
          kind: "income",
          amount: 800_000,
          date: `${thisMonth}-05`,
          categoryId: 11,
        },
        { id: 2, description: "Aluguel", amount: 200_000, date: `${thisMonth}-05`, categoryId: 1 },
        {
          id: 3,
          description: "Mês passado",
          amount: 1_000,
          date: `${shiftMonth(thisMonth, -1)}-10`,
        },
      ],
    });
    renderRoute(paths.finance.transactions);

    const list = await screen.findByRole("list", { name: "Lançamentos" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText(/Resultado/)).toHaveTextContent("R$ 6.000,00");

    await user.type(screen.getByLabelText("Buscar lançamentos"), "aluguel");
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText("Aluguel")).toBeInTheDocument();

    // Mês anterior: só o lançamento dele.
    await user.clear(screen.getByLabelText("Buscar lançamentos"));
    await user.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(await screen.findByText("Mês passado")).toBeInTheDocument();
    expect(screen.queryByText("Aluguel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mês atual" })).toBeInTheDocument();
  });

  it("alterna pago e pendente pelo botão de status", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend({
      accounts: [{ name: "C6" }],
      transactions: [
        {
          id: 7,
          description: "Internet",
          amount: 12_000,
          date: today,
          status: "pending",
        },
      ],
    });
    renderRoute(paths.finance.transactions);

    await user.click(
      await screen.findByRole("button", { name: /Pendente: marcar “Internet” como pago/ }),
    );

    expect(backend.handlers.set_transaction_status).toHaveBeenCalledWith({ id: 7, status: "paid" });
    expect(
      await screen.findByRole("button", { name: /Pago: marcar “Internet” como pendente/ }),
    ).toBeInTheDocument();
  });

  it("só exclui após confirmação explícita", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend({
      accounts: [{ name: "C6" }],
      transactions: [{ id: 3, description: "Cinema", amount: 6_000, date: today }],
    });
    renderRoute(paths.finance.transactions);

    await user.click(await screen.findByRole("button", { name: "Ações do lançamento “Cinema”" }));
    await user.click(await screen.findByRole("menuitem", { name: /Excluir/ }));

    const confirm = await screen.findByRole("alertdialog", { name: "Excluir lançamento?" });
    expect(within(confirm).getByText(/R\$ 60,00/)).toBeInTheDocument();
    expect(within(confirm).getByText(/registrada no log de auditoria/)).toBeInTheDocument();

    await user.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    expect(backend.handlers.delete_transaction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Ações do lançamento “Cinema”" }));
    await user.click(await screen.findByRole("menuitem", { name: /Excluir/ }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: /Excluir lançamento/,
      }),
    );

    await waitFor(() => {
      expect(backend.handlers.delete_transaction).toHaveBeenCalledWith({ id: 3 });
    });
    expect(await screen.findByText(/Nenhum lançamento em/)).toBeInTheDocument();
  });

  it("não deixa excluir uma conta com lançamentos", async () => {
    const user = userEvent.setup();
    mockFinanceBackend({
      accounts: [{ name: "C6" }, { name: "Nubank" }],
      transactions: [{ id: 1, accountId: 1, date: today }],
    });
    renderRoute(paths.finance.transactions);

    await user.click(await screen.findByRole("button", { name: /Contas/ }));
    const dialog = await screen.findByRole("dialog", { name: "Contas" });
    expect(within(dialog).getByRole("button", { name: "Excluir conta “C6”" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Excluir conta “Nubank”" })).toBeEnabled();
  });

  it("cria uma transferência entre contas", async () => {
    const user = userEvent.setup();
    const backend = mockFinanceBackend({ accounts: [{ name: "C6" }, { name: "Cartão C6" }] });
    renderRoute(paths.finance.transactions);

    await screen.findByText(/Nenhum lançamento em/);
    await user.click(screen.getAllByRole("button", { name: /Novo lançamento/ })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog", { name: "Novo lançamento" });
    await user.click(within(dialog).getByRole("tab", { name: "Transferência" }));
    expect(within(dialog).queryByLabelText("Categoria")).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Descrição *"), "Pagamento da fatura");
    await user.type(within(dialog).getByLabelText("Valor (R$) *"), "1.200,00");
    await user.click(within(dialog).getByLabelText("De (conta) *"));
    await user.click(await screen.findByRole("option", { name: "C6" }));
    await user.click(within(dialog).getByRole("button", { name: /Criar lançamento/ }));
    expect(await within(dialog).findByText("Escolha a conta de destino.")).toBeInTheDocument();

    await user.click(within(dialog).getByLabelText("Para (conta) *"));
    // A conta de origem não aparece como destino.
    expect(screen.queryByRole("option", { name: "C6" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "Cartão C6" }));
    await user.click(within(dialog).getByRole("button", { name: /Criar lançamento/ }));

    await waitFor(() => {
      expect(backend.handlers.create_transaction).toHaveBeenCalledWith({
        input: expect.objectContaining({
          kind: "transfer",
          accountId: 1,
          transferAccountId: 2,
          categoryId: null,
          amount: 120_000,
        }) as unknown,
      });
    });
    const list = await screen.findByRole("list", { name: "Lançamentos" });
    expect(within(list).getByText("Transferência")).toBeInTheDocument();
    expect(within(list).getByText("Cartão C6")).toBeInTheDocument();
  });

  it("importa um extrato revisando as linhas", async () => {
    const user = userEvent.setup();
    const line = (index: number, partial: Partial<PreviewLine>): PreviewLine => ({
      index,
      date: `${thisMonth}-10`,
      description: `Linha ${index}`,
      amount: 1_000,
      inflow: false,
      installment: null,
      sourceCategory: null,
      descriptionKey: null,
      duplicate: false,
      suggestion: {
        include: true,
        kind: "expense",
        categoryId: null,
        counterpartAccountId: null,
        reason: null,
        recurring: null,
      },
      recurringCandidates: [],
      ...partial,
    });
    const importPreview: ImportPreview = {
      previewId: 1,
      fileName: "",
      format: "ofx",
      accountKind: "checking",
      statementDate: null,
      firstDate: `${thisMonth}-01`,
      lastDate: `${thisMonth}-20`,
      lines: [
        line(0, { description: "POSTO EXEMPLO", amount: 20_000 }),
        line(1, {
          description: "Fatura de cartão",
          amount: 150_000,
          suggestion: {
            include: true,
            kind: "transfer",
            categoryId: null,
            counterpartAccountId: 2,
            reason: "card_payment",
            recurring: null,
          },
        }),
        line(2, {
          description: "Já importado",
          duplicate: true,
          suggestion: {
            include: false,
            kind: "expense",
            categoryId: null,
            counterpartAccountId: null,
            reason: "duplicate",
            recurring: null,
          },
        }),
      ],
    };
    const backend = mockFinanceBackend({
      accounts: [
        { name: "C6", kind: "checking" },
        { name: "Cartão C6", kind: "credit_card" },
      ],
      importPreview,
    });
    renderRoute(paths.finance.transactions);

    await user.click(await screen.findByRole("button", { name: /Importar/ }));
    const dialog = await screen.findByRole("dialog", { name: "Importar extrato" });
    await user.upload(
      within(dialog).getByLabelText("Arquivo do extrato"),
      new File(["<OFX>fictício</OFX>"], "extrato.ofx", { type: "application/x-ofx" }),
    );

    const rows = await within(dialog).findByRole("list", { name: "Lançamentos do arquivo" });
    expect(backend.handlers.preview_finance_import).toHaveBeenCalledWith({
      fileName: "extrato.ofx",
      content: "<OFX>fictício</OFX>",
    });
    // Já importados ficam ocultos; o pagamento da fatura vem como transferência.
    expect(within(rows).queryByText("Já importado")).not.toBeInTheDocument();
    expect(within(rows).getByText(/transferência para o cartão/)).toBeInTheDocument();
    expect(within(dialog).getByText(/para importar/)).toHaveTextContent(
      "2 para importar · 1 já importados · 0 deixados de fora",
    );

    await user.selectOptions(
      within(rows).getByLabelText("Categoria de “POSTO EXEMPLO”"),
      "Moradia",
    );
    await user.click(within(dialog).getByRole("button", { name: "Importar 2 lançamentos" }));

    await waitFor(() => {
      expect(backend.handlers.commit_finance_import).toHaveBeenCalledWith({
        input: {
          previewId: 1,
          accountId: 1,
          statementDate: null,
          lines: [
            {
              index: 0,
              kind: "expense",
              categoryId: 1,
              counterpartAccountId: null,
              recurring: null,
            },
            {
              index: 1,
              kind: "transfer",
              categoryId: null,
              counterpartAccountId: 2,
              recurring: null,
            },
          ],
        },
      });
    });
    expect(await screen.findByText("2 lançamentos importados")).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Lançamentos" });
    expect(within(list).getByText("POSTO EXEMPLO")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("vincula uma linha importada ao vencimento de uma recorrente", async () => {
    const user = userEvent.setup();
    const candidate = {
      recurringId: 4,
      occurrenceDate: `${thisMonth}-05`,
      description: "Aluguel",
      amount: 200_000,
      categoryId: 1,
    };
    const importPreview: ImportPreview = {
      previewId: 2,
      fileName: "",
      format: "ofx",
      accountKind: "checking",
      statementDate: null,
      firstDate: `${thisMonth}-01`,
      lastDate: `${thisMonth}-20`,
      lines: [
        {
          index: 0,
          date: `${thisMonth}-06`,
          description: "PIX IMOBILIARIA",
          amount: 200_000,
          inflow: false,
          installment: null,
          sourceCategory: null,
          descriptionKey: "desc:pix imobiliaria",
          duplicate: false,
          recurringCandidates: [candidate],
          suggestion: {
            include: true,
            kind: "expense",
            categoryId: 1,
            counterpartAccountId: null,
            reason: "recurring",
            recurring: { recurringId: 4, occurrenceDate: candidate.occurrenceDate },
          },
        },
      ],
    };
    const backend = mockFinanceBackend({ accounts: [{ name: "C6" }], importPreview });
    renderRoute(paths.finance.transactions);

    await user.click(await screen.findByRole("button", { name: /Importar/ }));
    const dialog = await screen.findByRole("dialog", { name: "Importar extrato" });
    await user.upload(
      within(dialog).getByLabelText("Arquivo do extrato"),
      new File(["<OFX>fictício</OFX>"], "extrato.ofx", { type: "application/x-ofx" }),
    );

    const rows = await within(dialog).findByRole("list", { name: "Lançamentos do arquivo" });
    expect(within(rows).getByText("Vencimento de recorrente")).toBeInTheDocument();
    const link = within(rows).getByLabelText<HTMLSelectElement>("Recorrente de “PIX IMOBILIARIA”");
    expect(link.selectedOptions[0]?.textContent).toMatch(/Paga “Aluguel” · vence/);
    expect(within(dialog).getByText(/para importar/)).toHaveTextContent("1 pagando recorrentes");

    // Desfazer e refazer o vínculo.
    await user.selectOptions(link, "Não é de uma recorrente");
    expect(within(dialog).getByText(/para importar/)).not.toHaveTextContent("recorrentes");
    await user.selectOptions(link, link.options[1] as HTMLOptionElement);
    await user.click(within(dialog).getByRole("button", { name: "Importar 1 lançamento" }));

    await waitFor(() => {
      expect(backend.handlers.commit_finance_import).toHaveBeenCalledWith({
        input: expect.objectContaining({
          lines: [
            {
              index: 0,
              kind: "expense",
              categoryId: 1,
              counterpartAccountId: null,
              recurring: { recurringId: 4, occurrenceDate: candidate.occurrenceDate },
            },
          ],
        }) as unknown,
      });
    });
    expect(await screen.findByText("1 lançamento importado")).toBeInTheDocument();
  });

  it("mostra o erro de um arquivo não reconhecido", async () => {
    const user = userEvent.setup();
    mockFinanceBackend({ accounts: [{ name: "C6" }] });
    renderRoute(paths.finance.transactions);

    await user.click(await screen.findByRole("button", { name: /Importar/ }));
    const dialog = await screen.findByRole("dialog", { name: "Importar extrato" });
    await user.upload(
      within(dialog).getByLabelText("Arquivo do extrato"),
      new File(["qualquer coisa"], "planilha.csv", { type: "text/csv" }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("formato não reconhecido");
  });
});
