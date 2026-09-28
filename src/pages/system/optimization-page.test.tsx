import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { paths } from "@/app/router/paths";
import { mockOptimizationBackend } from "@/test/fake-optimization-backend";
import { renderRoute } from "@/test/render";

describe("página de Otimização", () => {
  it("mostra o que cada categoria pode liberar, sem oferecer remoção", async () => {
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

    expect(
      screen.queryByRole("button", { name: /Limpar|Remover|Excluir/ }),
    ).not.toBeInTheDocument();
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
});
