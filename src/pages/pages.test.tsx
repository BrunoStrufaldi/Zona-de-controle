import { screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { paths } from "@/app/router/paths";
import { monthOf } from "@/features/finance/domain/period";
import { addDays, toIsoDate, weekdayOf } from "@/lib/dates";
import { mockDevicesBackend } from "@/test/fake-devices-backend";
import { mockDiagnosticsBackend } from "@/test/fake-diagnostics-backend";
import { mockFinanceBackend } from "@/test/fake-finance-backend";
import { EMPTY_HISTORY, mockOptimizationBackend } from "@/test/fake-optimization-backend";
import { mockRoutinesBackend } from "@/test/fake-routines-backend";
import { mockSystemBackend } from "@/test/fake-system-backend";
import { mockTasksBackend } from "@/test/fake-tasks-backend";
import { preloadDashboard, renderRoute } from "@/test/render";
import { mockDesktopRuntime } from "@/test/tauri";

describe("páginas integradas ao backend", () => {
  beforeAll(preloadDashboard);

  it("Dispositivos lista as fontes de leitura retornadas pelo Rust", async () => {
    mockDevicesBackend();
    renderRoute(paths.system.devices);

    const provider = (await screen.findByText("Detecta o receptor USB.")).closest(
      "li",
    ) as HTMLElement;
    expect(within(provider).getByText("Parcial")).toBeInTheDocument();
  });

  it("Configurações mostra aviso no navegador em vez de erro", async () => {
    renderRoute(paths.settings);

    expect(await screen.findByText("Disponível apenas no app desktop")).toBeInTheDocument();
  });

  it("Dashboard saúda o usuário pelo nome salvo", async () => {
    mockDesktopRuntime({
      get_setting: () => ({
        key: "profile.display_name",
        value: "Bruno",
        updatedAt: "2026-09-25T12:00:00Z",
      }),
      list_tasks: () => [],
    });
    renderRoute(paths.dashboard);

    expect(await screen.findByRole("heading", { level: 1, name: /, Bruno$/ })).toBeInTheDocument();
  });

  it("Dashboard resume as tarefas reais do dia", async () => {
    const today = toIsoDate(new Date());
    mockTasksBackend([
      { id: 1, title: "Atrasada", dueDate: addDays(today, -2) },
      { id: 2, title: "Para hoje", dueDate: today },
      { id: 3, title: "Feita hoje", status: "done", completedAt: new Date().toISOString() },
    ]);
    renderRoute(paths.dashboard);

    const upcoming = await screen.findByRole("list", { name: "Próximos vencimentos" });
    expect(within(upcoming).getByText("Atrasada")).toBeInTheDocument();
    expect(within(upcoming).getByText("Para hoje")).toBeInTheDocument();
    expect(screen.getByText("1 atrasada")).toBeInTheDocument();
    expect(screen.getByText("de 3 concluídas")).toBeInTheDocument();
  });

  it("Dashboard mostra as rotinas programadas para hoje", async () => {
    const tomorrow = (weekdayOf(toIsoDate(new Date())) + 1) % 7;
    mockRoutinesBackend([
      { name: "Manhã", habits: ["Água", "Alongar"], done: { 0: [0] } },
      { name: "Só amanhã", habits: ["Treinar"], weekdays: [tomorrow] },
    ]);
    renderRoute(paths.dashboard);

    const list = await screen.findByRole("list", { name: "Rotinas de hoje" });
    expect(within(list).getByText("Manhã")).toBeInTheDocument();
    expect(within(list).getByText("1/2")).toBeInTheDocument();
    expect(within(list).queryByText("Só amanhã")).not.toBeInTheDocument();
  });

  it("Dashboard mostra o status e o armazenamento reais do sistema", async () => {
    mockSystemBackend();
    renderRoute(paths.dashboard);

    const status = (await screen.findByRole("heading", { name: "Status do sistema" })).closest(
      "[data-slot='card']",
    ) as HTMLElement;
    // Memória em 75% (abaixo de 80%: estável); CPU ainda sendo medida na primeira leitura.
    expect(await within(status).findByText("Medindo…")).toBeInTheDocument();
    expect(within(status).getByText("Estável")).toBeInTheDocument();
    expect(within(status).getByText("2d 3h")).toBeInTheDocument();

    const disks = screen.getByRole("list", { name: "Unidades de armazenamento" });
    expect(within(disks).getByText("92% em uso · 40 GB livres")).toBeInTheDocument();
  });

  it("Dashboard resume o diagnóstico com os alertas mais graves", async () => {
    mockDiagnosticsBackend();
    renderRoute(paths.dashboard);

    const list = await screen.findByRole("list", { name: "Alertas do diagnóstico" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Pouco espaço livre em C:");
    // Resumo: sem recomendação (ela fica na tela Diagnósticos).
    expect(within(list).queryByText(/esvazie a Lixeira/)).not.toBeInTheDocument();
  });

  it("Dashboard mostra a bateria real dos dispositivos sem fio", async () => {
    mockDevicesBackend();
    renderRoute(paths.dashboard);

    const list = await screen.findByRole("list", { name: "Dispositivos com bateria" });
    expect(within(list).getByText("Rapoo VT7 Max")).toBeInTheDocument();
    expect(within(list).getByText("80%")).toBeInTheDocument();
    const card = list.closest("[data-slot='card']") as HTMLElement;
    expect(within(card).getByRole("link", { name: /Dispositivos/ })).toHaveAttribute(
      "href",
      paths.system.devices,
    );
  });

  it("Dashboard resume as limpezas com a última delas", async () => {
    const { handlers } = mockOptimizationBackend();
    renderRoute(paths.dashboard);

    const last = await screen.findByLabelText("Última limpeza");
    expect(handlers.list_cleanup_history).toHaveBeenCalledWith({ limit: 1 });
    // Não analisa as pastas no dashboard.
    expect(handlers.scan_cleanup).not.toHaveBeenCalled();
    expect(within(last).getByText("Não feita")).toBeInTheDocument();
    const card = last.closest("[data-slot='card']") as HTMLElement;
    expect(within(card).getByText("1,5 GB")).toBeInTheDocument();
    expect(within(card).getByText("liberados em 2 limpezas")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /Otimização/ })).toHaveAttribute(
      "href",
      paths.system.optimization,
    );
  });

  it("Dashboard indica quando nenhuma limpeza foi feita", async () => {
    mockOptimizationBackend(undefined, { history: EMPTY_HISTORY });
    renderRoute(paths.dashboard);

    expect(await screen.findByText(/Nenhuma limpeza feita ainda/)).toBeInTheDocument();
  });

  it("Dashboard mostra o resumo financeiro real do mês", async () => {
    const month = monthOf(toIsoDate(new Date()));
    const { handlers } = mockFinanceBackend({
      accounts: [{ name: "C6" }],
      transactions: [
        { id: 1, kind: "income", amount: 500_000, date: `${month}-05` },
        { id: 2, amount: 120_000, date: `${month}-06`, status: "pending" },
      ],
    });
    renderRoute(paths.dashboard);

    const metrics = (await screen.findByText("Saldo líquido")).closest("dl") as HTMLElement;
    expect(handlers.get_finance_overview).toHaveBeenCalledWith({ month });
    expect(within(metrics).getByText("R$ 5.000,00")).toBeInTheDocument();
    expect(within(metrics).getByText("R$ 1.200,00 a pagar")).toBeInTheDocument();
    expect(within(metrics).getByText("R$ 3.800,00")).toBeInTheDocument();
    const card = metrics.closest("[data-slot='card']") as HTMLElement;
    expect(within(card).queryByLabelText("Dados de demonstração")).not.toBeInTheDocument();
  });

  it("Dashboard mostra a carteira e o patrimônio reais", async () => {
    mockFinanceBackend({
      accounts: [{ name: "Investimentos C6", kind: "investment" }],
      investments: {
        assets: [{ name: "CDB C6", position: { value: 103_000, stale: true } }],
        totals: {
          value: 103_000,
          contributed: 100_000,
          withdrawn: 0,
          income: 0,
          invested: 100_000,
          gain: 3_000,
        },
        netWorth: { accounts: 500_000, investmentCash: 0, portfolio: 103_000, total: 603_000 },
        staleCount: 1,
      },
    });
    renderRoute(paths.dashboard);

    const carteira = await screen.findByText("Carteira", { selector: "dt" });
    expect(carteira.nextElementSibling).toHaveTextContent("R$ 1.030,00");
    expect(carteira.nextElementSibling).toHaveTextContent("+R$ 30,00 (+3%)");
    expect(screen.getByText("1 ativo precisa do valor atualizado")).toBeInTheDocument();
    const card = carteira.closest("[data-slot='card']") as HTMLElement;
    expect(within(card).getByText("R$ 6.030,00")).toBeInTheDocument();
    expect(within(card).queryByLabelText("Dados de demonstração")).not.toBeInTheDocument();
  });

  it("Dashboard convida a lançar quando o mês está vazio", async () => {
    mockFinanceBackend();
    renderRoute(paths.dashboard);

    expect(await screen.findByText("Nenhum lançamento neste mês")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Novo lançamento/ })).toHaveAttribute(
      "href",
      "/finance/transactions?new=1",
    );
  });
});
