import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { paths } from "@/app/router/paths";
import { EMPTY_HISTORY, mockOptimizationBackend } from "@/test/fake-optimization-backend";
import { renderRoute } from "@/test/render";

describe("página de Otimização", () => {
  it("mostra o que cada categoria pode liberar", async () => {
    mockOptimizationBackend();
    renderRoute(paths.system.optimization);

    // Pronto para liberar: 300 + 2048 + 20 + 10 + 50 + 5 MiB; o Chrome aberto fica à parte.
    expect(await screen.findByText("2,4 GB podem ser liberados")).toBeInTheDocument();
    expect(screen.getByText(/mais 1 GB em caches de navegadores abertos/)).toBeInTheDocument();

    const temp = screen.getByRole("list", { name: "Locais de Arquivos temporários" });
    expect(within(temp).getByText("250 arquivos")).toBeInTheDocument();
    expect(
      within(temp).getByText(/12 arquivos recentes \(40 MB\), com menos de 24 horas/),
    ).toBeInTheDocument();

    const caches = screen.getByRole("list", { name: "Locais de Caches seguros" });
    expect(within(caches).getByText("Em uso")).toBeInTheDocument();
    expect(
      within(caches).getByText("Feche o Google Chrome para limpar este cache."),
    ).toBeInTheDocument();
    expect(within(caches).getByText("Vazio")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Não encontrados neste computador: Shaders da AMD, Relatórios de erro do Windows, Brave, Mozilla Firefox.",
      ),
    ).toBeInTheDocument();
  });

  it("marca o que pode ser limpo, menos shaders; em uso e vazios não podem ser marcados", async () => {
    const user = userEvent.setup();
    mockOptimizationBackend();
    renderRoute(paths.system.optimization);

    const temp = await screen.findByRole("checkbox", {
      name: "Incluir Pasta temporária do usuário na limpeza",
    });
    expect(temp).toBeChecked();
    const nvidia = screen.getByRole("checkbox", { name: "Incluir Shaders da NVIDIA na limpeza" });
    expect(nvidia).not.toBeChecked();
    expect(nvidia).toBeEnabled();
    expect(
      screen.getByRole("checkbox", { name: "Incluir Google Chrome na limpeza" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "Incluir Shaders do DirectX na limpeza" }),
    ).toBeDisabled();
    // 300 + 20 + 10 + 50 + 5 MiB em 250 + 2 + 15 + 40 + 1 itens.
    expect(screen.getByText("Selecionado: 385 MB")).toBeInTheDocument();
    expect(screen.getByText(/308 itens em 5 locais/)).toBeInTheDocument();

    await user.click(nvidia);
    expect(screen.getByText("Selecionado: 2,4 GB")).toBeInTheDocument();

    for (const name of [
      "Pasta temporária do usuário",
      "Shaders da NVIDIA",
      "Despejos de travamento",
      "Miniaturas do Explorer",
      "Microsoft Edge",
      "Lixeira do Windows",
    ]) {
      await user.click(screen.getByRole("checkbox", { name: `Incluir ${name} na limpeza` }));
    }
    expect(screen.getByText("Marque os locais que quer limpar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Limpar selecionados/ })).toBeDisabled();
  });

  it("só limpa depois da confirmação, que lista cada local", async () => {
    const user = userEvent.setup();
    const { handlers } = mockOptimizationBackend();
    renderRoute(paths.system.optimization);

    await user.click(await screen.findByRole("button", { name: /Limpar selecionados/ }));
    const confirm = await screen.findByRole("alertdialog", { name: "Remover 385 MB?" });
    const list = within(confirm).getByRole("list", { name: "O que será removido" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(within(list).getByText("250 arquivos · 300 MB")).toBeInTheDocument();
    expect(
      within(confirm).getByText("A remoção é permanente: os arquivos não vão para a Lixeira."),
    ).toBeInTheDocument();
    expect(within(confirm).getByText(/A Lixeira é esvaziada de uma vez/)).toBeInTheDocument();

    // Desistir não chama o backend.
    await user.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    expect(handlers.run_cleanup).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Limpar selecionados/ }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: /Remover 385 MB/,
      }),
    );

    const result = await screen.findByRole("alertdialog", { name: "Limpeza concluída" });
    expect(handlers.run_cleanup).toHaveBeenCalledWith({
      scanId: 7,
      sources: ["userTemp", "crashDumps", "thumbnails", "edge", "recycleBin"],
    });
    // 385 MiB menos 2 MiB em uso.
    expect(within(result).getByText(/383 MB liberados · 306 itens removidos/)).toBeInTheDocument();
    expect(
      within(result).getByText(/248 de 250 arquivos removidos · 2 em uso/),
    ).toBeInTheDocument();
    expect(
      within(result).getByText("C:\\Users\\teste\\AppData\\Local\\Temp\\aberto-1.tmp"),
    ).toBeInTheDocument();

    await user.click(within(result).getByRole("button", { name: "Fechar e analisar de novo" }));
    await waitFor(() => {
      expect(handlers.scan_cleanup).toHaveBeenCalledTimes(2);
    });
    // O histórico também é relido, para mostrar a limpeza nova.
    expect(handlers.list_cleanup_history).toHaveBeenCalledTimes(2);
  });

  it("mostra o andamento e cancela entre arquivos", async () => {
    const user = userEvent.setup();
    let finish: (cancelled: boolean) => void = () => undefined;
    const { handlers } = mockOptimizationBackend(undefined, {
      progress: {
        totalItems: 308,
        processedItems: 100,
        removedBytes: 50 * 1024 ** 2,
        currentSource: "userTemp",
        cancelRequested: false,
      },
      runCleanup: (args) =>
        new Promise((resolve) => {
          finish = (cancelled) => {
            resolve({
              cancelled,
              sources: args.sources.map((source, index) => ({
                source,
                plannedCount: index === 0 ? 250 : 10,
                removedCount: index === 0 ? 100 : 0,
                removedBytes: index === 0 ? 50 * 1024 ** 2 : 0,
                inUseCount: 0,
                changedCount: 0,
                failedCount: 0,
              })),
              notRemoved: [],
            });
          };
        }),
    });
    renderRoute(paths.system.optimization);

    await user.click(await screen.findByRole("button", { name: /Limpar selecionados/ }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: /Remover/ }),
    );
    const running = await screen.findByRole("alertdialog", { name: "Limpando…" });
    expect(
      await within(running).findByText("100 de 308 itens · 50 MB liberados"),
    ).toBeInTheDocument();
    expect(within(running).getByText(/Agora: Pasta temporária do usuário/)).toBeInTheDocument();
    // Enquanto roda, a análise não pode ser refeita (a página fica atrás do diálogo modal).
    expect(screen.getByRole("button", { name: /Analisar de novo/, hidden: true })).toBeDisabled();

    await user.click(within(running).getByRole("button", { name: /Cancelar limpeza/ }));
    expect(handlers.cancel_cleanup).toHaveBeenCalledTimes(1);
    expect(within(running).getByRole("button", { name: /Cancelando/ })).toBeDisabled();

    finish(true);
    const result = await screen.findByRole("alertdialog", { name: "Limpeza cancelada" });
    expect(within(result).getByText(/150 não processados/)).toBeInTheDocument();
  });

  it("mostra a recusa do Rust sem remover nada", async () => {
    const user = userEvent.setup();
    mockOptimizationBackend(undefined, {
      runCleanup: () => {
        // O Tauri rejeita com o AppError serializado (objeto puro), não com um Error.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw {
          kind: "validation",
          message: "Feche o Microsoft Edge antes de limpar o cache dele.",
        };
      },
    });
    renderRoute(paths.system.optimization);

    await user.click(await screen.findByRole("button", { name: /Limpar selecionados/ }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: /Remover/ }),
    );
    const error = await screen.findByRole("alertdialog", { name: "A limpeza não foi feita" });
    expect(
      within(error).getByText("Feche o Microsoft Edge antes de limpar o cache dele."),
    ).toBeInTheDocument();
  });

  it("lista os itens exatos de uma origem, por página", async () => {
    const user = userEvent.setup();
    const { handlers } = mockOptimizationBackend();
    renderRoute(paths.system.optimization);

    await user.click(
      await screen.findByRole("button", { name: "Ver itens de Pasta temporária do usuário" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Pasta temporária do usuário" });
    expect(
      await within(dialog).findByText("C:\\Users\\teste\\AppData\\Local\\userTemp\\arquivo-0.tmp"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Mostrando 100 de 250 arquivos")).toBeInTheDocument();
    expect(handlers.list_cleanup_items).toHaveBeenLastCalledWith({
      scanId: 7,
      source: "userTemp",
      offset: 0,
      limit: 100,
    });

    await user.click(within(dialog).getByRole("button", { name: "Carregar mais" }));
    expect(await within(dialog).findByText("Mostrando 200 de 250 arquivos")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Carregar mais" }));
    expect(await within(dialog).findByText("Mostrando 250 de 250 arquivos")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Carregar mais" })).not.toBeInTheDocument();
  });

  it("na Lixeira mostra o local original e a data da exclusão", async () => {
    const user = userEvent.setup();
    mockOptimizationBackend();
    renderRoute(paths.system.optimization);

    await user.click(
      await screen.findByRole("button", { name: "Ver itens de Lixeira do Windows" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Lixeira do Windows" });
    expect(await within(dialog).findByText("D:\\Fotos\\antiga-0.jpg")).toBeInTheDocument();
    expect(within(dialog).getByText("Local original")).toBeInTheDocument();
    expect(within(dialog).getByText("Excluído em")).toBeInTheDocument();
    expect(within(dialog).getByText("20/09/2026 14:30")).toBeInTheDocument();
    expect(within(dialog).getByText("Mostrando 1 de 1 item")).toBeInTheDocument();
  });

  it("analisa de novo", async () => {
    const user = userEvent.setup();
    const { handlers } = mockOptimizationBackend();
    renderRoute(paths.system.optimization);

    await screen.findByText("2,4 GB podem ser liberados");
    await user.click(screen.getByRole("button", { name: /Analisar de novo/ }));
    await waitFor(() => {
      expect(handlers.scan_cleanup).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("2,4 GB podem ser liberados")).toBeInTheDocument();
  });

  it("mostra o histórico das limpezas, com o motivo das recusas", async () => {
    const { handlers } = mockOptimizationBackend();
    renderRoute(paths.system.optimization);

    const list = await screen.findByRole("list", { name: "Limpezas recentes" });
    expect(handlers.list_cleanup_history).toHaveBeenCalledWith({ limit: 20 });
    expect(screen.getByText("1,5 GB liberados em 2 limpezas")).toBeInTheDocument();
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Não feita");
    expect(items[0]).toHaveTextContent("Feche o Google Chrome antes de limpar o cache dele.");
    expect(items[1]).toHaveTextContent("Cancelada");
    expect(items[1]).toHaveTextContent("512 MB liberados · 100 itens removidos · 150 ficaram");
    expect(items[2]).toHaveTextContent(
      "Pasta temporária do usuário, Microsoft Edge e Lixeira do Windows",
    );
  });

  it("sem limpezas, o histórico diz que nenhuma foi feita", async () => {
    mockOptimizationBackend(undefined, { history: EMPTY_HISTORY });
    renderRoute(paths.system.optimization);

    expect(await screen.findByText("Nenhuma limpeza feita ainda.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Limpezas recentes" })).not.toBeInTheDocument();
  });
});
